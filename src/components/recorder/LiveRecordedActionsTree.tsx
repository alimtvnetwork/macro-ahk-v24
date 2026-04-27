/**
 * Marco Extension — Live Recorded Actions Tree
 *
 * Real-time view of `session.Steps` from the active {@link useRecordingSession}.
 * Renders the in-flight steps (Click / Type / Select / Submit / Wait / JsInline)
 * as a clickable list inside the Floating Controller's Expanded mode. Updates
 * automatically as the recorder appends new steps because the source hook
 * re-renders on every storage change.
 *
 * This is intentionally separate from {@link RecorderLiveTreePanel}, which
 * shows the *persisted* Step Group library. This component shows the
 * *transient* draft of the active session — the actions the user is
 * recording right now.
 */

import { useEffect, useRef, useState } from "react";
import {
    Clock,
    FileCode2,
    MousePointerClick,
    Send,
    SquareCheck,
    Type as TypeIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useRecordingSession } from "@/hooks/use-recording-session";
import type {
    RecordedStep,
    RecordedStepKind,
} from "@/background/recorder/recorder-session-types";

interface KindMeta {
    readonly Icon: typeof MousePointerClick;
    readonly Label: string;
    readonly Tone: string;
}

const KIND_META: Record<RecordedStepKind, KindMeta> = {
    Click:    { Icon: MousePointerClick, Label: "Click",  Tone: "text-primary" },
    Type:     { Icon: TypeIcon,          Label: "Type",   Tone: "text-blue-400" },
    Select:   { Icon: SquareCheck,       Label: "Select", Tone: "text-emerald-400" },
    Submit:   { Icon: Send,              Label: "Submit", Tone: "text-purple-400" },
    Wait:     { Icon: Clock,             Label: "Wait",   Tone: "text-amber-400" },
    JsInline: { Icon: FileCode2,         Label: "JS",     Tone: "text-pink-400" },
};

export interface LiveRecordedActionsTreeProps {
    readonly className?: string;
    readonly onStepClick?: (step: RecordedStep) => void;
}

export function LiveRecordedActionsTree(props: LiveRecordedActionsTreeProps): JSX.Element {
    const { className, onStepClick } = props;
    const { session } = useRecordingSession();
    const steps = session?.Steps ?? [];
    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

    // Auto-scroll to the latest step when a new one arrives so the user
    // always sees the most recent action without manual scrolling.
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const lastCountRef = useRef<number>(0);
    useEffect(() => {
        if (steps.length > lastCountRef.current) {
            const node = scrollRef.current;
            if (node !== null) { node.scrollTop = node.scrollHeight; }
        }
        lastCountRef.current = steps.length;
    }, [steps.length]);

    const isRecording = session?.Phase === "Recording";
    const isPaused = session?.Phase === "Paused";

    return (
        <div
            className={cn(
                "rounded-md border border-border/60 bg-background/40 p-2 space-y-1.5",
                className,
            )}
            data-testid="live-recorded-actions-tree"
        >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground px-1">
                <div className="flex items-center gap-1.5">
                    <span
                        className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            isRecording ? "bg-destructive animate-pulse" :
                            isPaused ? "bg-amber-400" : "bg-muted",
                        )}
                        aria-hidden
                    />
                    <span>Live actions</span>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {steps.length}
                </Badge>
            </div>

            <ScrollArea className="h-[180px]">
                <div ref={scrollRef} className="pr-2">
                    {steps.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center py-6 italic">
                            {session === null
                                ? "No active session — press Play to start recording."
                                : "Waiting for the first action…"}
                        </p>
                    ) : (
                        <ul className="space-y-1" role="tree" aria-label="Recorded actions">
                            {steps.map((step) => (
                                <ActionRow
                                    key={step.StepId}
                                    step={step}
                                    selected={selectedStepId === step.StepId}
                                    onClick={() => {
                                        setSelectedStepId(step.StepId);
                                        onStepClick?.(step);
                                    }}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

interface ActionRowProps {
    readonly step: RecordedStep;
    readonly selected: boolean;
    readonly onClick: () => void;
}

function ActionRow(props: ActionRowProps): JSX.Element {
    const { step, selected, onClick } = props;
    const meta = KIND_META[step.Kind];
    const Icon = meta.Icon;
    const selectorPreview = step.Selector?.XPathRelative ?? step.Selector?.XPathFull ?? "";

    return (
        <li role="treeitem" aria-selected={selected}>
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    "w-full text-left flex items-start gap-2 rounded px-1.5 py-1 text-[11px]",
                    "hover:bg-primary/10 transition-colors",
                    selected && "bg-primary/15 ring-1 ring-primary/40",
                )}
                data-testid={`live-action-${step.StepId}`}
                title={selectorPreview}
            >
                <Badge variant="outline" className="text-[9px] w-5 justify-center shrink-0 mt-0.5">
                    {step.Index + 1}
                </Badge>
                <Icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", meta.Tone)} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="font-medium">{meta.Label}</span>
                        {step.VariableName ? (
                            <code className="text-[10px] text-muted-foreground font-mono truncate">
                                ${step.VariableName}
                            </code>
                        ) : null}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                        {step.Label || selectorPreview || "—"}
                    </div>
                </div>
            </button>
        </li>
    );
}
