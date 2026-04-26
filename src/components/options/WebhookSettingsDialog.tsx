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
import { Plus, Send, Trash2, Webhook } from "lucide-react";

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

export default function WebhookSettingsDialog({ open, onOpenChange }: Props) {
    const [draft, setDraft] = useState<WebhookConfig>(DEFAULT_WEBHOOK_CONFIG);
    const [log, setLog] = useState<ReadonlyArray<WebhookDeliveryResult>>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) {
            setDraft(loadWebhookConfig());
            setLog(getDeliveryLog());
        }
    }, [open]);

    const eventSet = useMemo(() => new Set(draft.Events), [draft.Events]);

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
        if (result.Ok) {
            toast.success(`Webhook reached endpoint (HTTP ${result.Status ?? "?"})`);
        } else if (result.Skipped) {
            toast.warning(`Skipped: ${result.SkipReason ?? "unknown reason"}`);
        } else {
            toast.error(`Webhook failed: ${result.Error ?? "unknown error"}`);
        }
    };

    const handleClearLog = () => {
        clearDeliveryLog();
        setLog([]);
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
                                <Label className="text-sm font-medium">Recent deliveries</Label>
                                <div className="flex items-center gap-2">
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
                            {log.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    No deliveries yet. The last 20 attempts will appear here.
                                </p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {log.map((entry, i) => (
                                        <li
                                            key={`${entry.EmittedAt}-${i}`}
                                            className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5 text-xs"
                                        >
                                            <div className="flex min-w-0 items-center gap-2">
                                                <Badge
                                                    variant={
                                                        entry.Skipped ? "outline"
                                                            : entry.Ok ? "default" : "destructive"
                                                    }
                                                    className="shrink-0"
                                                >
                                                    {entry.Skipped ? "Skip" : entry.Ok ? `OK ${entry.Status ?? ""}` : "Fail"}
                                                </Badge>
                                                <span className="truncate font-mono">{entry.Event}</span>
                                                {(entry.SkipReason ?? entry.Error) !== null && (
                                                    <span className="truncate text-muted-foreground">
                                                        {entry.SkipReason ?? entry.Error}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="shrink-0 text-muted-foreground">
                                                {formatTime(entry.EmittedAt)} · {entry.DurationMs} ms
                                            </span>
                                        </li>
                                    ))}
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
