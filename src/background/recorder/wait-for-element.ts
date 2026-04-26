/**
 * Marco Extension — Wait-For-Element Gate
 *
 * Pure polling helper used by the replay executor to pause AFTER an
 * actuating step (Click / Type / Select) until a backend-controlled UI
 * element appears in the live DOM. Mirrors Playwright's `waitForSelector`
 * but without any chrome.* / messaging dependencies so it's unit-testable
 * under jsdom and reusable from the content script.
 *
 * The selector dialect is the same minimal trio used elsewhere in the
 * recorder: XPath (default — auto-detected by leading `/` or `(`), CSS,
 * or Aria-as-CSS. See {@link ResolvedSelector} in `replay-resolver.ts`
 * for the full grammar.
 *
 * Per `mem://standards/verbose-logging-and-failure-diagnostics`, the
 * caller is responsible for wrapping a timeout into a structured
 * failure report — this module only returns a discriminated outcome.
 *
 * @see ./live-dom-replay.ts  — Caller that gates Click/Type/Select on this.
 */

export type WaitForKind = "Auto" | "XPath" | "Css";

export interface WaitForSpec {
    /** Selector expression — XPath or CSS. */
    readonly Expression: string;
    /** When `Auto` (default), `/` and `(` prefixes mean XPath, else CSS. */
    readonly Kind?: WaitForKind;
    /** Hard ceiling in ms. Caller must supply — no implicit default. */
    readonly TimeoutMs: number;
    /** Poll interval in ms. Defaults to 50 when omitted. */
    readonly PollMs?: number;
}

export type WaitForOutcome =
    | { readonly Ok: true;  readonly DurationMs: number; readonly ResolvedKind: "XPath" | "Css" }
    | { readonly Ok: false; readonly DurationMs: number; readonly Reason: "Timeout" | "InvalidSelector"; readonly Detail: string };

export interface WaitForOptions {
    readonly Doc: Document;
    readonly Sleep?: (ms: number) => Promise<void>;
    readonly Now?: () => number;
}

/**
 * Poll the document until `spec.Expression` resolves to an `HTMLElement`
 * or the timeout elapses. Pure — no DOM mutation, no event dispatch.
 */
export async function waitForElement(
    spec: WaitForSpec,
    options: WaitForOptions,
): Promise<WaitForOutcome> {
    const sleep   = options.Sleep ?? defaultSleep;
    const now     = options.Now   ?? defaultNow;
    const pollMs  = Math.max(1, spec.PollMs ?? 50);
    const kind    = resolveKind(spec.Kind ?? "Auto", spec.Expression);
    const started = now();
    const deadline = started + Math.max(0, spec.TimeoutMs);

    for (;;) {
        let found: HTMLElement | null;
        try {
            found = locate(spec.Expression, kind, options.Doc);
        } catch (err) {
            return {
                Ok: false,
                DurationMs: now() - started,
                Reason: "InvalidSelector",
                Detail: err instanceof Error ? err.message : String(err),
            };
        }
        if (found !== null) {
            return { Ok: true, DurationMs: now() - started, ResolvedKind: kind };
        }
        if (now() >= deadline) {
            return {
                Ok: false,
                DurationMs: now() - started,
                Reason: "Timeout",
                Detail: `WaitFor '${spec.Expression}' timed out after ${spec.TimeoutMs}ms`,
            };
        }
        await sleep(pollMs);
    }
}

function resolveKind(kind: WaitForKind, expression: string): "XPath" | "Css" {
    if (kind === "XPath") { return "XPath"; }
    if (kind === "Css")   { return "Css"; }
    const trimmed = expression.trimStart();
    return (trimmed.startsWith("/") || trimmed.startsWith("(")) ? "XPath" : "Css";
}

function locate(expression: string, kind: "XPath" | "Css", doc: Document): HTMLElement | null {
    if (kind === "XPath") {
        const r = doc.evaluate(expression, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = r.singleNodeValue;
        return node instanceof HTMLElement ? node : null;
    }
    const el = doc.querySelector(expression);
    return el instanceof HTMLElement ? el : null;
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function defaultNow(): number {
    return Date.now();
}
