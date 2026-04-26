/**
 * Marco Extension — Step Wait Selector Dialog
 *
 * Configure (or clear) the post-step wait condition for a single Step.
 * Wraps the pure helpers in `step-wait.ts` so the dialog stays
 * presentation-only.
 *
 * UX:
 *   - Selector field with live auto-detect badge (Css / XPath).
 *   - "Override" radio lets the user pin Kind when auto-detect picks
 *     the wrong language.
 *   - Condition select (Appears / Disappears / Visible).
 *   - Timeout in ms (clamped 250–60 000).
 *   - Save / Clear / Cancel.
 *
 * The dialog never persists until the user clicks Save, and always
 * round-trips through the sanitiser in `writeStepWait`.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, MousePointer2, Trash2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    DEFAULT_WAIT_CONFIG,
    clearStepWait,
    detectSelectorKind,
    readStepWait,
    validateSelector,
    writeStepWait,
    type SelectorKind,
    type WaitCondition,
    type WaitConfig,
} from "@/background/recorder/step-library/step-wait";

interface Props {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly stepId: number | null;
    readonly stepLabel: string | null;
    /** Notifies the parent to refresh its "has wait" badge state. */
    readonly onChange?: () => void;
}

type KindMode = "Auto" | "Css" | "XPath";

const CONDITION_LABELS: Record<WaitCondition, string> = {
    Appears: "Element appears in DOM",
    Disappears: "Element disappears from DOM",
    Visible: "Element is visible (has layout)",
};

const CONDITION_ICON: Record<WaitCondition, typeof Eye> = {
    Appears: MousePointer2,
    Disappears: EyeOff,
    Visible: Eye,
};

export default function StepWaitDialog(props: Props) {
    const { open, onOpenChange, stepId, stepLabel, onChange } = props;

    const [selector, setSelector] = useState("");
    const [kindMode, setKindMode] = useState<KindMode>("Auto");
    const [condition, setCondition] = useState<WaitCondition>(DEFAULT_WAIT_CONFIG.Condition);
    const [timeoutMs, setTimeoutMs] = useState<number>(DEFAULT_WAIT_CONFIG.TimeoutMs);
    const [hasExisting, setHasExisting] = useState(false);

    useEffect(() => {
        if (!open || stepId === null) return;
        const existing = readStepWait(stepId);
        if (existing === null) {
            setSelector("");
            setKindMode("Auto");
            setCondition(DEFAULT_WAIT_CONFIG.Condition);
            setTimeoutMs(DEFAULT_WAIT_CONFIG.TimeoutMs);
            setHasExisting(false);
        } else {
            setSelector(existing.Selector);
            setKindMode(existing.Kind);
            setCondition(existing.Condition);
            setTimeoutMs(existing.TimeoutMs);
            setHasExisting(true);
        }
    }, [open, stepId]);

    const detected: SelectorKind = useMemo(
        () => detectSelectorKind(selector),
        [selector],
    );
    const effectiveKind: SelectorKind =
        kindMode === "Auto" ? detected : kindMode;

    const validation = useMemo(
        () => selector.trim().length === 0
            ? { Ok: true as const, Kind: effectiveKind }
            : validateSelector(selector, effectiveKind),
        [selector, effectiveKind],
    );

    const handleSave = () => {
        if (stepId === null) return;
        if (selector.trim().length === 0) {
            toast.error("Selector is required");
            return;
        }
        if (!validation.Ok) {
            toast.error(validation.Reason);
            return;
        }
        const next: WaitConfig = {
            Selector: selector.trim(),
            Kind: effectiveKind,
            Condition: condition,
            TimeoutMs: timeoutMs,
        };
        try {
            writeStepWait(stepId, next);
            toast.success("Wait condition saved");
            onChange?.();
            onOpenChange(false);
        } catch (e) {
            const detail = e instanceof Error ? e.message : "Unknown error";
            toast.error(`Could not save: ${detail}`);
        }
    };

    const handleClear = () => {
        if (stepId === null) return;
        clearStepWait(stepId);
        toast.success("Wait condition cleared");
        onChange?.();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Wait after this step</DialogTitle>
                    <DialogDescription>
                        {stepLabel === null || stepLabel.length === 0
                            ? "After this step runs, wait for the selector below to satisfy the chosen condition before continuing."
                            : `After "${stepLabel}" runs, wait for this selector before continuing.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Selector */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="wait-selector" className="text-sm font-medium">
                                Selector
                            </Label>
                            {selector.trim().length > 0 && (
                                <Badge variant={kindMode === "Auto" ? "secondary" : "outline"}>
                                    {kindMode === "Auto" ? `Auto · ${detected}` : effectiveKind}
                                </Badge>
                            )}
                        </div>
                        <Input
                            id="wait-selector"
                            placeholder="#submit-confirmation, .loading, //div[@id='ok']"
                            value={selector}
                            onChange={(e) => setSelector(e.target.value)}
                            className="font-mono text-sm"
                        />
                        {!validation.Ok && (
                            <p className="text-xs text-destructive">{validation.Reason}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Auto-detect picks XPath when the expression starts with <code>/</code>,
                            <code> ./</code>, <code>(/</code>, <code>(./</code>, or contains <code>//</code>.
                        </p>
                    </div>

                    {/* Kind override */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Selector type</Label>
                        <Select
                            value={kindMode}
                            onValueChange={(v) => setKindMode(v as KindMode)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Auto">Auto-detect</SelectItem>
                                <SelectItem value="Css">Force CSS</SelectItem>
                                <SelectItem value="XPath">Force XPath</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Condition */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Condition</Label>
                        <Select
                            value={condition}
                            onValueChange={(v) => setCondition(v as WaitCondition)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(["Appears", "Visible", "Disappears"] as const).map((c) => {
                                    const Icon = CONDITION_ICON[c];
                                    return (
                                        <SelectItem key={c} value={c}>
                                            <span className="flex items-center gap-2">
                                                <Icon className="h-3.5 w-3.5" />
                                                {CONDITION_LABELS[c]}
                                            </span>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Timeout */}
                    <div className="space-y-1.5">
                        <Label htmlFor="wait-timeout" className="text-xs text-muted-foreground">
                            Timeout (ms, 250 – 60 000)
                        </Label>
                        <Input
                            id="wait-timeout"
                            type="number"
                            min={250}
                            max={60000}
                            step={250}
                            value={timeoutMs}
                            onChange={(e) => setTimeoutMs(
                                Number.parseInt(e.target.value, 10) || timeoutMs,
                            )}
                        />
                    </div>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                    <div>
                        {hasExisting && (
                            <Button variant="ghost" onClick={handleClear}>
                                <Trash2 className="mr-1 h-4 w-4" />
                                Remove wait
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>Save</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
