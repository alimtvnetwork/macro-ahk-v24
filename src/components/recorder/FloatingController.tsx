/**
 * Marco Extension — Floating Recorder Controller (MVP)
 *
 * Compact floating panel that surfaces the active RecordingSession with
 * Play/Pause/Stop controls. Three modes:
 *   • Mini     — recording dot + Stop (two-tap safety)
 *   • Compact  — Play/Pause + Stop, elapsed timer, status chips for the
 *                active StepGroup / SubGroup, step counter
 *   • Expanded — Compact + space for future panels (last captured step,
 *                quick-actions). MVP renders the chips only.
 *
 * Position: per-session top-right (no drag in MVP). Mode persists in
 * `chrome.storage.local` via a tiny adapter so the user's preference
 * survives reloads. Phase + dispatchers come from
 * {@link useRecordingSession} so this component is purely presentational.
 *
 * @see ../../hooks/use-recording-session.ts
 * @see ../../background/recorder/recorder-store.ts
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Circle,
    Maximize2,
    Minimize2,
    Pause,
    Play,
    Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RecordingSession } from "@/background/recorder/recorder-session-types";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

export type ControllerMode = "mini" | "compact" | "expanded";

const MODE_STORAGE_KEY = "marco-floating-controller-mode";
const STOP_CONFIRM_TIMEOUT_MS = 2500;

export interface FloatingControllerProps {
    readonly session: RecordingSession;
    readonly activeStepGroupName?: string | null;
    readonly activeSubGroupName?: string | null;
    readonly onPause: () => void | Promise<void>;
    readonly onResume: () => void | Promise<void>;
    readonly onStop: () => void | Promise<void>;
    /** Optional override for SSR/tests so we don't poke window during render. */
    readonly initialMode?: ControllerMode;
}

/* ------------------------------------------------------------------ */
/*  Mode persistence                                                   */
/* ------------------------------------------------------------------ */

function loadMode(): ControllerMode {
    if (typeof window === "undefined") { return "compact"; }
    try {
        const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
        if (raw === "mini" || raw === "compact" || raw === "expanded") { return raw; }
    } catch { /* ignore */ }
    return "compact";
}

function saveMode(mode: ControllerMode): void {
    if (typeof window === "undefined") { return; }
    try { window.localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Elapsed timer                                                      */
/* ------------------------------------------------------------------ */

function formatElapsed(startedAt: string, nowMs: number): string {
    const startMs = Date.parse(startedAt);
    if (Number.isNaN(startMs)) { return "00:00"; }
    const total = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    if (total < 3600) { return `${m}:${s}`; }
    const h = Math.floor(total / 3600).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
}

function useElapsedTicker(startedAt: string, isRunning: boolean): string {
    const [now, setNow] = useState<number>(() => Date.now());
    useEffect(() => {
        if (!isRunning) { return; }
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [isRunning]);
    return useMemo(() => formatElapsed(startedAt, now), [startedAt, now]);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FloatingController(props: FloatingControllerProps): JSX.Element {
    const { session, activeStepGroupName, activeSubGroupName, onPause, onResume, onStop, initialMode } = props;

    const [mode, setMode] = useState<ControllerMode>(() => initialMode ?? loadMode());
    const [stopArmed, setStopArmed] = useState<boolean>(false);
    const stopTimer = useRef<number | null>(null);

    useEffect(() => { saveMode(mode); }, [mode]);
    useEffect(() => () => {
        if (stopTimer.current !== null) { window.clearTimeout(stopTimer.current); }
    }, []);

    const isRecording = session.Phase === "Recording";
    const elapsed = useElapsedTicker(session.StartedAt, isRecording);
    const stepCount = session.Steps.length;

    const handleStop = () => {
        if (!stopArmed) {
            setStopArmed(true);
            if (stopTimer.current !== null) { window.clearTimeout(stopTimer.current); }
            stopTimer.current = window.setTimeout(() => setStopArmed(false), STOP_CONFIRM_TIMEOUT_MS);
            return;
        }
        if (stopTimer.current !== null) { window.clearTimeout(stopTimer.current); }
        stopTimer.current = null;
        setStopArmed(false);
        void onStop();
    };

    const cyclePrimary = () => { void (isRecording ? onPause() : onResume()); };

    /* ------------------------------------------------------------ */
    /*  Mini mode                                                    */
    /* ------------------------------------------------------------ */
    if (mode === "mini") {
        return (
            <FloatingShell mode={mode} onModeChange={setMode} testid="floating-controller-mini">
                <div className="flex items-center gap-2">
                    <RecordingDot isRecording={isRecording} />
                    <StopButton armed={stopArmed} onClick={handleStop} compact />
                </div>
            </FloatingShell>
        );
    }

    /* ------------------------------------------------------------ */
    /*  Compact / Expanded modes                                     */
    /* ------------------------------------------------------------ */
    return (
        <FloatingShell mode={mode} onModeChange={setMode} testid={`floating-controller-${mode}`}>
            <div className="flex items-center gap-2">
                <RecordingDot isRecording={isRecording} />
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={cyclePrimary}
                    className="h-8 px-3"
                    data-testid="controller-primary"
                    aria-label={isRecording ? "Pause recording" : "Resume recording"}
                >
                    {isRecording ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <StopButton armed={stopArmed} onClick={handleStop} />
                <span
                    className="text-xs font-mono tabular-nums text-muted-foreground min-w-[3.5rem] text-right"
                    data-testid="controller-elapsed"
                >
                    {elapsed}
                </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {session.Phase}
                </Badge>
                {activeStepGroupName !== null && activeStepGroupName !== undefined && activeStepGroupName !== "" ? (
                    <Badge variant="secondary" className="text-[10px]" data-testid="controller-stepgroup-chip">
                        {activeStepGroupName}
                    </Badge>
                ) : null}
                {activeSubGroupName !== null && activeSubGroupName !== undefined && activeSubGroupName !== "" ? (
                    <Badge variant="secondary" className="text-[10px]" data-testid="controller-subgroup-chip">
                        {activeSubGroupName}
                    </Badge>
                ) : null}
                <Badge variant="outline" className="text-[10px]">
                    {stepCount} step{stepCount === 1 ? "" : "s"}
                </Badge>
            </div>

            {mode === "expanded" ? (
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 mt-1">
                    Project: <span className="font-mono">{session.ProjectSlug}</span>
                </div>
            ) : null}
        </FloatingShell>
    );
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function FloatingShell(props: {
    mode: ControllerMode;
    onModeChange: (m: ControllerMode) => void;
    children: React.ReactNode;
    testid: string;
}): JSX.Element {
    const { mode, onModeChange, children, testid } = props;
    return (
        <div
            className={cn(
                "fixed top-4 right-4 z-[2147483600]",
                "rounded-lg border border-border bg-card/95 backdrop-blur",
                "shadow-lg shadow-black/30 text-card-foreground",
                "p-2 flex flex-col gap-1",
                mode === "mini" ? "w-auto" : "min-w-[260px]",
            )}
            role="region"
            aria-label="Floating recorder controller"
            data-testid={testid}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">
                    Recorder
                </span>
                <ModeSwitcher mode={mode} onModeChange={onModeChange} />
            </div>
            {children}
        </div>
    );
}

function ModeSwitcher(props: { mode: ControllerMode; onModeChange: (m: ControllerMode) => void }): JSX.Element {
    const { mode, onModeChange } = props;
    const next: Record<ControllerMode, ControllerMode> = {
        mini: "compact",
        compact: "expanded",
        expanded: "mini",
    };
    const Icon = mode === "expanded" ? Minimize2 : Maximize2;
    return (
        <button
            type="button"
            onClick={() => onModeChange(next[mode])}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            aria-label={`Switch to ${next[mode]} mode`}
            data-testid="controller-mode-switch"
        >
            <Icon className="h-3 w-3" />
        </button>
    );
}

function RecordingDot(props: { isRecording: boolean }): JSX.Element {
    const { isRecording } = props;
    return (
        <span
            className={cn(
                "inline-flex h-2.5 w-2.5 rounded-full",
                isRecording ? "bg-destructive animate-pulse" : "bg-muted-foreground",
            )}
            aria-label={isRecording ? "Recording" : "Paused"}
            data-testid="controller-status-dot"
        >
            <Circle className="sr-only" />
        </span>
    );
}

function StopButton(props: { armed: boolean; onClick: () => void; compact?: boolean }): JSX.Element {
    const { armed, onClick, compact } = props;
    return (
        <Button
            size="sm"
            variant={armed ? "destructive" : "outline"}
            onClick={onClick}
            className={cn("h-8", compact ? "px-2" : "px-3")}
            data-testid="controller-stop"
            data-armed={armed ? "true" : "false"}
            aria-label={armed ? "Confirm stop recording" : "Stop recording"}
        >
            <Square className="h-3.5 w-3.5" />
            {!compact ? <span className="ml-1 text-xs">{armed ? "Confirm" : "Stop"}</span> : null}
        </Button>
    );
}
