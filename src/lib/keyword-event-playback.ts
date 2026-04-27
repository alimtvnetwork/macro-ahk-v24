/**
 * Marco Extension — Keyword Event playback engine
 *
 * Executes a {@link KeywordEvent}'s ordered steps sequentially:
 *   • "Key"  — dispatches a synthetic KeyboardEvent (keydown+keyup) on the
 *             active element (or document.body fallback) with parsed modifiers.
 *   • "Wait" — awaits the specified duration before continuing.
 *
 * Designed to be cancellable via {@link AbortSignal} so the recorder can
 * abort scripted playback when the user hits Stop.
 */

import type { KeywordEvent, KeywordEventStep } from "@/hooks/use-keyword-events";

export interface PlaybackOptions {
    /** Optional target. Falls back to document.activeElement, then document.body. */
    readonly target?: EventTarget | null;
    /** Abort the playback mid-sequence. */
    readonly signal?: AbortSignal;
    /** Per-step lifecycle callback for telemetry/UI progress. */
    readonly onStep?: (step: KeywordEventStep, index: number) => void;
}

export interface PlaybackResult {
    readonly Completed: boolean;
    readonly StepsRun: number;
    readonly Aborted: boolean;
}

interface ParsedCombo {
    readonly Key: string;
    readonly Ctrl: boolean;
    readonly Shift: boolean;
    readonly Alt: boolean;
    readonly Meta: boolean;
}

/** Parse a combo string like "Ctrl+Shift+Enter" into its parts. */
export function parseCombo(combo: string): ParsedCombo {
    const parts = combo.split("+").map(p => p.trim()).filter(Boolean);
    let Ctrl = false, Shift = false, Alt = false, Meta = false;
    let Key = "";
    for (const p of parts) {
        const lower = p.toLowerCase();
        if (lower === "ctrl" || lower === "control") Ctrl = true;
        else if (lower === "shift") Shift = true;
        else if (lower === "alt" || lower === "option") Alt = true;
        else if (lower === "meta" || lower === "cmd" || lower === "command") Meta = true;
        else Key = p;
    }
    return { Key, Ctrl, Shift, Alt, Meta };
}

function resolveTarget(target?: EventTarget | null): EventTarget {
    if (target) return target;
    if (typeof document !== "undefined") {
        return document.activeElement ?? document.body ?? document;
    }
    throw new Error("No DOM target available for keyboard playback");
}

function dispatchKey(target: EventTarget, type: "keydown" | "keyup", parsed: ParsedCombo): void {
    const init: KeyboardEventInit = {
        key: parsed.Key,
        code: parsed.Key.length === 1 ? `Key${parsed.Key.toUpperCase()}` : parsed.Key,
        ctrlKey: parsed.Ctrl,
        shiftKey: parsed.Shift,
        altKey: parsed.Alt,
        metaKey: parsed.Meta,
        bubbles: true,
        cancelable: true,
    };
    target.dispatchEvent(new KeyboardEvent(type, init));
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, Math.max(0, ms));
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/**
 * Run all steps of `event` sequentially. Resolves with a result describing
 * whether playback completed or was aborted.
 */
export async function runKeywordEvent(
    event: KeywordEvent,
    options: PlaybackOptions = {},
): Promise<PlaybackResult> {
    if (!event.Enabled) {
        return { Completed: false, StepsRun: 0, Aborted: false };
    }

    const target = resolveTarget(options.target);
    let stepsRun = 0;

    try {
        for (let i = 0; i < event.Steps.length; i += 1) {
            if (options.signal?.aborted) {
                return { Completed: false, StepsRun: stepsRun, Aborted: true };
            }
            const step = event.Steps[i];
            options.onStep?.(step, i);

            if (step.Kind === "Key") {
                const parsed = parseCombo(step.Combo);
                if (!parsed.Key) continue;
                dispatchKey(target, "keydown", parsed);
                dispatchKey(target, "keyup", parsed);
            } else {
                await wait(step.DurationMs, options.signal);
            }
            stepsRun += 1;
        }
        return { Completed: true, StepsRun: stepsRun, Aborted: false };
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
            return { Completed: false, StepsRun: stepsRun, Aborted: true };
        }
        throw err;
    }
}
