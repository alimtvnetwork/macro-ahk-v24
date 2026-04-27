/**
 * Marco Extension — Webhook Settings Dialog
 *
 * Configures the per-project HTTP endpoint that receives execution
 * and recording results. Backed by `result-webhook.ts` storage.
 *
 * Sections:
 *   1. Enable toggle + URL + Timeout
 *   2. Headers editor (name/value rows, add/remove)
 *   3. Event subscriptions (4 toggles)
 *   4. Test ping button → fires a synthetic GroupRunSucceeded
 *   5. Last 20 delivery attempts (newest first)
 *
 * The dialog is fully self-contained: it owns its draft state, only
 * persists on Save, and reads back from `loadWebhookConfig()` when
 * reopened so cancel ⇒ original config remains intact.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
    ALL_WEBHOOK_EVENTS,
    DEFAULT_WEBHOOK_CONFIG,
    clearDeliveryLog,
    dispatchWebhook,
    getDeliveryLog,
    loadWebhookConfig,
    saveWebhookConfig,
    type WebhookConfig,
    type WebhookEventKind,
    type WebhookHeader,
    type WebhookDeliveryResult,
    type WebhookDeliverySuccess,
    type WebhookDeliverySkipped,
    type WebhookDeliveryFailure,
    isWebhookFailure,
    isWebhookSkipped,
    isWebhookSuccess,
} from "@/background/recorder/step-library/result-webhook";

interface Props {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}

const EVENT_LABELS: Record<WebhookEventKind, string> = {
    GroupRunSucceeded: "Group run succeeded",
    GroupRunFailed: "Group run failed",
    BatchComplete: "Batch run complete",
    RecordingStopped: "Recording stopped",
};

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleTimeString();
    } catch {
        return iso;
    }
}

function formatPayloadJson(entry: WebhookDeliveryResult): string | null {
    if (entry.Payload === null || entry.Payload === undefined) return null;
    try {
        return JSON.stringify(entry.Payload, null, 2);
    } catch (err) {
        return `// Failed to serialise payload: ${err instanceof Error ? err.message : String(err)}`;
    }
}

function describeSuccess(entry: WebhookDeliverySuccess): string {
    return `Status: OK (HTTP ${entry.Status})`;
}

function describeSkipped(entry: WebhookDeliverySkipped): string {
    return `Status: Skipped\nSkip reason: ${entry.SkipReason}`;
}

function describeFailure(entry: WebhookDeliveryFailure): string {
    const httpPart = entry.Status !== null ? ` (HTTP ${entry.Status})` : "";
    return `Status: Failed${httpPart}\nError: ${entry.Error}`;
}

type VariantBadgeVariant = "default" | "secondary" | "outline" | "destructive";

interface VariantPresentation {
    readonly badgeLabel: string;
    readonly badgeVariant: VariantBadgeVariant;
    readonly badgeExtraClass: string;
    readonly rowClass: string;
    readonly hoverClass: string;
    readonly summaryDetail: string | null;
    readonly summaryDetailClass: string;
    readonly eventClass: string;
}

const ROW_SUCCESS = "rounded-md border border-emerald-500/30 bg-emerald-500/5 text-xs";
const ROW_SKIPPED = "rounded-md border border-dashed border-muted-foreground/40 bg-muted/10 text-xs";
const ROW_FAILED  = "rounded-md border border-destructive/60 bg-destructive/10 text-xs shadow-[0_0_0_1px_hsl(var(--destructive)/0.35)]";

function presentSuccess(entry: WebhookDeliverySuccess): VariantPresentation {
    return {
        badgeLabel: `OK ${entry.Status}`,
        badgeVariant: "default",
        badgeExtraClass: "",
        rowClass: ROW_SUCCESS,
        hoverClass: "hover:bg-emerald-500/10",
        summaryDetail: null,
        summaryDetailClass: "",
        eventClass: "",
    };
}

function presentSkipped(entry: WebhookDeliverySkipped): VariantPresentation {
    return {
        badgeLabel: "Skipped",
        badgeVariant: "outline",
        badgeExtraClass: "",
        rowClass: ROW_SKIPPED,
        hoverClass: "hover:bg-muted/30",
        summaryDetail: entry.SkipReason,
        summaryDetailClass: "text-muted-foreground",
        eventClass: "",
    };
}

function presentFailure(entry: WebhookDeliveryFailure): VariantPresentation {
    const statusSuffix = entry.Status !== null ? ` ${entry.Status}` : "";
    return {
        badgeLabel: `Failed${statusSuffix}`,
        badgeVariant: "destructive",
        badgeExtraClass: "uppercase tracking-wide font-bold ring-1 ring-destructive/60 shadow-sm",
        rowClass: ROW_FAILED,
        hoverClass: "hover:bg-destructive/15",
        summaryDetail: entry.Error,
        summaryDetailClass: "text-destructive/90 font-medium",
        eventClass: "text-destructive font-semibold",
    };
}

function presentVariant(entry: WebhookDeliveryResult): VariantPresentation {
    if (isWebhookSuccess(entry)) return presentSuccess(entry);
    if (isWebhookSkipped(entry)) return presentSkipped(entry);
    return presentFailure(entry);
}

function buildLogClipboardText(entry: WebhookDeliveryResult): string {
    const lines: string[] = [
        `Event: ${entry.Event}`,
        `Emitted: ${entry.EmittedAt}`,
        `Duration: ${entry.DurationMs} ms`,
    ];
    if (isWebhookSkipped(entry)) {
        lines.push(describeSkipped(entry));
    } else if (isWebhookSuccess(entry)) {
        lines.push(describeSuccess(entry));
    } else if (isWebhookFailure(entry)) {
        lines.push(describeFailure(entry));
    }
    const payloadJson = formatPayloadJson(entry);
    if (payloadJson !== null) {
        lines.push("Payload:");
        lines.push(payloadJson);
    }
    return lines.join("\n");
}

async function copyLogEntry(entry: WebhookDeliveryResult): Promise<void> {
    const text = buildLogClipboardText(entry);
    try {
        await navigator.clipboard.writeText(text);
        toast.success("Webhook details copied");
    } catch (err) {
        toast.error(`Copy failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

export default function WebhookSettingsDialog({ open, onOpenChange }: Props) {
    const [draft, setDraft] = useState<WebhookConfig>(DEFAULT_WEBHOOK_CONFIG);
    const [log, setLog] = useState<ReadonlyArray<WebhookDeliveryResult>>([]);
    const [busy, setBusy] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const [payloadOpenIdx, setPayloadOpenIdx] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<"all" | "success" | "skipped" | "failure">("all");

    useEffect(() => {
        if (open) {
            setDraft(loadWebhookConfig());
            setLog(getDeliveryLog());
        }
    }, [open]);

    const eventSet = useMemo(() => new Set(draft.Events), [draft.Events]);

    const logCounts = useMemo(() => {
        let success = 0;
        let skipped = 0;
        let failure = 0;
        for (const entry of log) {
            if (isWebhookSkipped(entry)) skipped += 1;
            else if (isWebhookSuccess(entry)) success += 1;
            else failure += 1;
        }
        return { all: log.length, success, skipped, failure };
    }, [log]);

    const filteredLog = useMemo(() => {
        if (statusFilter === "all") return log;
        return log.filter((entry) => {
            if (statusFilter === "skipped") return isWebhookSkipped(entry);
            if (statusFilter === "success") return isWebhookSuccess(entry);
            return !isWebhookSkipped(entry) && !isWebhookSuccess(entry);
        });
    }, [log, statusFilter]);

    const toggleEvent = (kind: WebhookEventKind, on: boolean) => {
        setDraft((prev) => {
            const next = new Set(prev.Events);
            if (on) next.add(kind); else next.delete(kind);
            return {
                ...prev,
                Events: ALL_WEBHOOK_EVENTS.filter((k) => next.has(k)),
            };
        });
    };

    const updateHeader = (idx: number, patch: Partial<WebhookHeader>) => {
        setDraft((prev) => ({
            ...prev,
            Headers: prev.Headers.map((h, i) => (i === idx ? { ...h, ...patch } : h)),
        }));
    };

    const addHeader = () => {
        setDraft((prev) => ({
            ...prev,
            Headers: [...prev.Headers, { Name: "", Value: "" }],
        }));
    };

    const removeHeader = (idx: number) => {
        setDraft((prev) => ({
            ...prev,
            Headers: prev.Headers.filter((_, i) => i !== idx),
        }));
    };

    const handleSave = () => {
        const saved = saveWebhookConfig(draft);
        setDraft(saved);
        toast.success("Webhook settings saved");
        onOpenChange(false);
    };

    const handleTest = async () => {
        const cfgToUse = saveWebhookConfig({ ...draft, Enabled: true });
        setDraft(cfgToUse);
        if (cfgToUse.Url.trim().length === 0) {
            toast.error("Add a URL before sending a test ping");
            return;
        }
        setBusy(true);
        const result = await dispatchWebhook(
            "GroupRunSucceeded",
            {
                ProjectId: 0,
                GroupId: 0,
                GroupName: "Webhook Test Ping",
                DurationMs: 0,
                StepsExecuted: 0,
                Outcome: "Succeeded",
                IsTest: true,
            },
            { config: cfgToUse },
        );
        setBusy(false);
        setLog(getDeliveryLog());
        if (isWebhookSkipped(result)) {
            toast.warning(`Skipped: ${result.SkipReason}`);
        } else if (isWebhookSuccess(result)) {
            toast.success(`Webhook reached endpoint (HTTP ${result.Status})`);
        } else {
            toast.error(`Webhook failed: ${result.Error}`);
        }
    };

    const handleClearLog = () => {
        clearDeliveryLog();
        setLog([]);
        setExpandedIdx(null);
        setPayloadOpenIdx(null);
    };

    const refreshLog = () => {
        setLog(getDeliveryLog());
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Webhook className="h-4 w-4" />
                        Result webhook
                    </DialogTitle>
                    <DialogDescription>
                        Send group-run, batch-run, and recording results to an external HTTP endpoint
                        as JSON. Leave disabled to opt out entirely.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh] pr-3">
                    <div className="space-y-5">
                        {/* Enable + URL + timeout */}
                        <section className="space-y-3 rounded-md border p-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="hook-enabled" className="text-sm font-medium">
                                    Send results to webhook
                                </Label>
                                <Switch
                                    id="hook-enabled"
                                    checked={draft.Enabled}
                                    onCheckedChange={(v) => setDraft((p) => ({ ...p, Enabled: v }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="hook-url" className="text-xs text-muted-foreground">
                                    Endpoint URL — supports {"{{GroupId}}"}, {"{{GroupName}}"}, {"{{Event}}"} tokens
                                </Label>
                                <Input
                                    id="hook-url"
                                    type="url"
                                    placeholder="https://example.com/webhooks/marco"
                                    value={draft.Url}
                                    onChange={(e) => setDraft((p) => ({ ...p, Url: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="hook-timeout" className="text-xs text-muted-foreground">
                                    Timeout (ms, 1 000 – 60 000)
                                </Label>
                                <Input
                                    id="hook-timeout"
                                    type="number"
                                    min={1000}
                                    max={60000}
                                    step={500}
                                    value={draft.TimeoutMs}
                                    onChange={(e) => setDraft((p) => ({
                                        ...p,
                                        TimeoutMs: Number.parseInt(e.target.value, 10) || p.TimeoutMs,
                                    }))}
                                />
                            </div>
                        </section>

                        {/* Headers */}
                        <section className="space-y-2 rounded-md border p-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">Custom headers</Label>
                                <Button size="sm" variant="outline" onClick={addHeader}>
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    Add header
                                </Button>
                            </div>
                            {draft.Headers.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    No custom headers. Add one for bearer tokens, signing keys, etc.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {draft.Headers.map((h, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <Input
                                                placeholder="Header name"
                                                value={h.Name}
                                                onChange={(e) => updateHeader(i, { Name: e.target.value })}
                                                className="flex-1"
                                            />
                                            <Input
                                                placeholder="Header value"
                                                value={h.Value}
                                                onChange={(e) => updateHeader(i, { Value: e.target.value })}
                                                className="flex-[2]"
                                            />
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => removeHeader(i)}
                                                aria-label={`Remove header ${h.Name || i + 1}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Events */}
                        <section className="space-y-2 rounded-md border p-3">
                            <Label className="text-sm font-medium">Send on these events</Label>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {ALL_WEBHOOK_EVENTS.map((kind) => (
                                    <label
                                        key={kind}
                                        className="flex cursor-pointer items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm"
                                    >
                                        <Checkbox
                                            checked={eventSet.has(kind)}
                                            onCheckedChange={(v) => toggleEvent(kind, v === true)}
                                        />
                                        <span className="truncate">{EVENT_LABELS[kind]}</span>
                                    </label>
                                ))}
                            </div>
                            {draft.Events.length === 0 && (
                                <p className="text-xs text-destructive">
                                    No events selected — webhook will never fire.
                                </p>
                            )}
                        </section>

                        {/* Delivery log */}
                        <section className="space-y-2 rounded-md border p-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">
                                    Recent deliveries
                                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                        ({log.length}/20)
                                    </span>
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="ghost" onClick={refreshLog} title="Refresh log">
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={handleTest} disabled={busy}>
                                        <Send className="mr-1 h-3.5 w-3.5" />
                                        {busy ? "Sending…" : "Send test ping"}
                                    </Button>
                                    {log.length > 0 && (
                                        <Button size="sm" variant="ghost" onClick={handleClearLog}>
                                            Clear
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {log.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter deliveries by status">
                                    {([
                                        { key: "all", label: "All", count: logCounts.all, activeClass: "bg-foreground text-background border-foreground" },
                                        { key: "success", label: "OK", count: logCounts.success, activeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/60" },
                                        { key: "skipped", label: "Skipped", count: logCounts.skipped, activeClass: "bg-muted text-foreground border-muted-foreground/60" },
                                        { key: "failure", label: "Failed", count: logCounts.failure, activeClass: "bg-destructive/20 text-destructive border-destructive/60" },
                                    ] as const).map((chip) => {
                                        const active = statusFilter === chip.key;
                                        const disabled = chip.key !== "all" && chip.count === 0;
                                        return (
                                            <button
                                                key={chip.key}
                                                type="button"
                                                onClick={() => setStatusFilter(chip.key)}
                                                disabled={disabled}
                                                aria-pressed={active}
                                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? chip.activeClass : "border-border bg-transparent text-muted-foreground hover:bg-muted/40"}`}
                                            >
                                                {chip.label}
                                                <span className={`rounded-full px-1 text-[10px] ${active ? "bg-background/30" : "bg-muted/60"}`}>
                                                    {chip.count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {log.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 px-4 py-6 text-center">
                                    <Webhook className="h-6 w-6 text-muted-foreground/60" aria-hidden />
                                    <p className="text-sm font-medium text-foreground">No deliveries yet</p>
                                    <p className="text-xs text-muted-foreground max-w-xs">
                                        {draft.Enabled && draft.Url.trim().length > 0
                                            ? "The last 20 webhook attempts will appear here, newest first. Use \"Send test ping\" to verify your endpoint."
                                            : "Enable the webhook and set an endpoint URL above, then run a group or use \"Send test ping\" to see delivery results here."}
                                    </p>
                                </div>
                            ) : filteredLog.length === 0 ? (
                                <p className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 px-3 py-4 text-center text-xs text-muted-foreground">
                                    No deliveries match the “{statusFilter}” filter.{" "}
                                    <button
                                        type="button"
                                        className="underline underline-offset-2 hover:text-foreground"
                                        onClick={() => setStatusFilter("all")}
                                    >
                                        Show all
                                    </button>
                                </p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {filteredLog.map((entry, i) => {
                                        const presentation = presentVariant(entry);
                                        const hasPayload = entry.Payload !== null && entry.Payload !== undefined;
                                        const hasSummaryDetail = presentation.summaryDetail !== null;
                                        const isExpandable = hasSummaryDetail || hasPayload || isWebhookSuccess(entry);
                                        const isOpen = expandedIdx === i;
                                        return (
                                            <li
                                                key={`${entry.EmittedAt}-${i}`}
                                                className={presentation.rowClass}
                                            >
                                                <button
                                                    type="button"
                                                    className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left ${presentation.hoverClass}`}
                                                    onClick={() => isExpandable && setExpandedIdx(isOpen ? null : i)}
                                                    aria-expanded={isOpen}
                                                    aria-controls={`hook-log-detail-${i}`}
                                                    disabled={!isExpandable}
                                                >
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <Badge
                                                            variant={presentation.badgeVariant}
                                                            className={`shrink-0 ${presentation.badgeExtraClass}`}
                                                        >
                                                            {presentation.badgeLabel}
                                                        </Badge>
                                                        <span className={`shrink-0 font-mono ${presentation.eventClass}`}>{entry.Event}</span>
                                                        {hasSummaryDetail && (
                                                            <span className={`truncate ${presentation.summaryDetailClass}`}>
                                                                — {presentation.summaryDetail}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                                                        <span>{formatTime(entry.EmittedAt)} · {entry.DurationMs} ms</span>
                                                        {isExpandable && (
                                                            <ChevronDown
                                                                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                                            />
                                                        )}
                                                    </span>
                                                </button>
                                                {isOpen && isExpandable && (
                                                    <div
                                                        id={`hook-log-detail-${i}`}
                                                        className="border-t px-2 py-1.5"
                                                    >
                                                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                                                            <dt className="text-muted-foreground">Emitted</dt>
                                                            <dd className="font-mono">{entry.EmittedAt}</dd>
                                                            <dt className="text-muted-foreground">Duration</dt>
                                                            <dd className="font-mono">{entry.DurationMs} ms</dd>
                                                            {isWebhookSuccess(entry) && (
                                                                <>
                                                                    <dt className="text-muted-foreground">HTTP</dt>
                                                                    <dd className="font-mono">{entry.Status}</dd>
                                                                </>
                                                            )}
                                                            {isWebhookSkipped(entry) && (
                                                                <>
                                                                    <dt className="text-muted-foreground">Skip reason</dt>
                                                                    <dd className="whitespace-pre-wrap break-words font-mono">
                                                                        {entry.SkipReason}
                                                                    </dd>
                                                                </>
                                                            )}
                                                            {isWebhookFailure(entry) && (
                                                                <>
                                                                    {entry.Status !== null && (
                                                                        <>
                                                                            <dt className="text-muted-foreground">HTTP</dt>
                                                                            <dd className="font-mono">{entry.Status}</dd>
                                                                        </>
                                                                    )}
                                                                    <dt className="text-muted-foreground">Error</dt>
                                                                    <dd className="whitespace-pre-wrap break-words font-mono text-destructive">
                                                                        {entry.Error}
                                                                    </dd>
                                                                </>
                                                            )}
                                                        </dl>
                                                        {(() => {
                                                            const payloadJson = formatPayloadJson(entry);
                                                            const payloadOpen = payloadOpenIdx === i;
                                                            return (
                                                                <div className="mt-2 space-y-2">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <button
                                                                            type="button"
                                                                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                                                                            onClick={() => setPayloadOpenIdx(payloadOpen ? null : i)}
                                                                            disabled={payloadJson === null}
                                                                            aria-expanded={payloadOpen}
                                                                            aria-controls={`hook-log-payload-${i}`}
                                                                        >
                                                                            <ChevronDown
                                                                                className={`h-3 w-3 transition-transform ${payloadOpen ? "rotate-180" : ""}`}
                                                                            />
                                                                            {payloadJson === null
                                                                                ? "Raw JSON payload (not captured)"
                                                                                : payloadOpen ? "Hide raw JSON payload" : "Show raw JSON payload"}
                                                                        </button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() => void copyLogEntry(entry)}
                                                                        >
                                                                            <Copy className="mr-1 h-3.5 w-3.5" />
                                                                            Copy details
                                                                        </Button>
                                                                    </div>
                                                                    {payloadOpen && payloadJson !== null && (
                                                                        <pre
                                                                            id={`hook-log-payload-${i}`}
                                                                            className="max-h-64 overflow-auto rounded-md border bg-background/60 p-2 text-[11px] font-mono whitespace-pre-wrap break-words"
                                                                        >
                                                                            {payloadJson}
                                                                        </pre>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>
                    </div>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save settings</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
