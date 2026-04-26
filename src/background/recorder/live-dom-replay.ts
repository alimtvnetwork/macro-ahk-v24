/**
 * Marco Extension — Live-DOM Replay Executor
 *
 * Phase 09 — Macro Recorder.
 *
 * Consumes a list of persisted Steps + their selectors, locates each target
 * in the live DOM via {@link resolveStepSelector}, and dispatches a real
 * browser event (`click`, `input`, `change`, …) on it. This is the missing
 * caller side — the resolver is pure, and this module is the imperative
 * actuator.
 *
 * Pure event dispatch only — no chrome.* or messaging. Caller supplies the
 * Document and the binding/value lookup so the same code is unit-testable
 * under jsdom and shippable in the content script.
 *
 * @see ./replay-resolver.ts          — Pure selector resolution.
 * @see ./field-reference-resolver.ts — `{{Column}}` substitution for Type values.
 * @see spec/31-macro-recorder/12-record-replay-e2e-contract.md
 */

import { resolveStepSelector, type ResolvedSelector } from "./replay-resolver";
import { resolveFieldReferences, type FieldRow } from "./field-reference-resolver";
import type { PersistedSelector } from "./step-persistence";

export interface ReplayStepInput {
    readonly StepId: number;
    readonly Index: number;
    readonly Kind: "Click" | "Type" | "Select" | "Wait";
    readonly Selectors: ReadonlyArray<PersistedSelector>;
    /** For Type/Select — the literal value or a `{{Column}}` template. */
    readonly Value?: string;
    /** For Wait — milliseconds. */
    readonly WaitMs?: number;
}

export interface ReplayOptions {
    readonly Doc: Document;
    /** Active data-source row used to resolve `{{Column}}` templates in Value. */
    readonly Row?: FieldRow;
    /** Sleep implementation — injected so tests can fast-forward. */
    readonly Sleep?: (ms: number) => Promise<void>;
}

export interface ReplayStepResult {
    readonly StepId: number;
    readonly Index: number;
    readonly Ok: boolean;
    readonly Error?: string;
    readonly ResolvedXPath?: string;
}

export async function executeReplay(
    steps: ReadonlyArray<ReplayStepInput>,
    options: ReplayOptions,
): Promise<ReplayStepResult[]> {
    const sleep = options.Sleep ?? defaultSleep;
    const results: ReplayStepResult[] = [];
    for (const step of steps) {
        results.push(await executeStep(step, options, sleep));
    }
    return results;
}

async function executeStep(
    step: ReplayStepInput,
    options: ReplayOptions,
    sleep: (ms: number) => Promise<void>,
): Promise<ReplayStepResult> {
    try {
        if (step.Kind === "Wait") {
            await sleep(step.WaitMs ?? 0);
            return { StepId: step.StepId, Index: step.Index, Ok: true };
        }

        const resolved = resolveStepSelector(step.Selectors);
        const target = locateElement(resolved, options.Doc);
        if (target === null) {
            return { StepId: step.StepId, Index: step.Index, Ok: false,
                ResolvedXPath: resolved.Expression,
                Error: `Element not found for selector '${resolved.Expression}'` };
        }

        if (step.Kind === "Click")  { dispatchClick(target); }
        if (step.Kind === "Type")   { dispatchType(target,   resolveValue(step.Value, options.Row)); }
        if (step.Kind === "Select") { dispatchSelect(target, resolveValue(step.Value, options.Row)); }

        return { StepId: step.StepId, Index: step.Index, Ok: true, ResolvedXPath: resolved.Expression };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { StepId: step.StepId, Index: step.Index, Ok: false, Error: message };
    }
}

function resolveValue(raw: string | undefined, row: FieldRow | undefined): string {
    if (raw === undefined || raw === "") { return ""; }
    if (row === undefined)               { return raw; }
    return resolveFieldReferences(raw, row);
}

/* ------------------------------------------------------------------ */
/*  DOM lookup                                                         */
/* ------------------------------------------------------------------ */

function locateElement(resolved: ResolvedSelector, doc: Document): HTMLElement | null {
    if (resolved.Kind === "XPath") {
        const r = doc.evaluate(resolved.Expression, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = r.singleNodeValue;
        return node instanceof HTMLElement ? node : null;
    }
    if (resolved.Kind === "Css") {
        const el = doc.querySelector(resolved.Expression);
        return el instanceof HTMLElement ? el : null;
    }
    // Aria — minimal support: `[aria-label="…"]`-style expressions are passed straight to querySelector
    const el = doc.querySelector(resolved.Expression);
    return el instanceof HTMLElement ? el : null;
}

/* ------------------------------------------------------------------ */
/*  Event dispatch                                                     */
/* ------------------------------------------------------------------ */

function dispatchClick(el: HTMLElement): void {
    el.focus({ preventScroll: true });
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click",     { bubbles: true, cancelable: true }));
}

function dispatchType(el: HTMLElement, value: string): void {
    el.focus({ preventScroll: true });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const proto = el instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter !== undefined) {
            setter.call(el, value);
        } else {
            el.value = value;
        }
    } else if (el.isContentEditable) {
        el.textContent = value;
    } else {
        return; // not typeable
    }
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
}

function dispatchSelect(el: HTMLElement, value: string): void {
    if (!(el instanceof HTMLSelectElement)) { return; }
    el.value = value;
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
