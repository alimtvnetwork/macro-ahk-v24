/**
 * Marco Extension — Recorder Failure Logger
 *
 * Single shared formatter for any failure raised during the macro
 * recorder's two pipelines: **Record** (capturing + persisting Steps) and
 * **Replay** (executing persisted Steps against the live DOM).
 *
 * The output is a structured `FailureReport` JSON document optimised for
 * AI debugging — the user can copy it from a toast or DevTools and paste
 * it directly into ChatGPT/Claude. Every report carries:
 *
 *   - `Phase`            — `"Record" | "Replay"`, the pipeline that failed.
 *   - `Message`          — short human-readable summary.
 *   - `StackTrace`       — `Error.stack` when available.
 *   - `Selectors`        — every selector kind/expression the executor tried.
 *   - `DomContext`       — tag/id/class/aria-label/text snippet of the
 *                          target element (replay) or capture element
 *                          (record), so the AI can spot selector drift.
 *   - `DataRow`          — active `{{Column}}` row at failure time, optional.
 *   - `StepId`/`Index`   — locate the step in the project's Step list.
 *   - `Timestamp`        — ISO string, deterministic via injected `Now`.
 *
 * Pure: no DOM mutation, no chrome.*, no async. The DOM read for
 * `DomContext` is a single `getBoundingClientRect`-free pass that tolerates
 * `null`/detached nodes.
 *
 * Conformance:
 *   - Every error site stamps an exact source location and tried-selector
 *     list per `spec/03-error-manage` rules ("HARD ERROR logs must include
 *     exact path, what was missing, and reasoning — optimized for AI
 *     consumption" — mem://standards/error-logging-requirements).
 *
 * @see spec/03-error-manage/01-error-resolution/06-error-documentation-guideline.md
 * @see ./live-dom-replay.ts          — Replay-phase caller.
 * @see ./capture-to-step-bridge.ts   — Record-phase data shape.
 */

import type { PersistedSelector } from "./step-persistence";
import type { FieldRow } from "./field-reference-resolver";
import type {
    EvaluatedAttempt,
    AttemptFailureReason,
} from "./selector-attempt-evaluator";

export type FailurePhase = "Record" | "Replay";

/**
 * Top-level short-code classifying the failure for AI grouping.
 * Stable string values — UI / exporters key off these.
 */
export type FailureReasonCode =
    | "ZeroMatches"           // No selector (primary or fallback) matched anything.
    | "PrimaryMissedFallbackOk" // Primary missed but a fallback matched — drift.
    | "XPathSyntaxError"      // At least one XPath threw during evaluation.
    | "CssSyntaxError"        // At least one CSS selector threw.
    | "UnresolvedAnchor"      // XPathRelative anchor chain broken / cyclic.
    | "EmptyExpression"       // A stored expression was "".
    | "NoSelectors"           // Step had zero selectors persisted.
    | "Timeout"               // Wait/Retry exceeded budget (set by callers).
    | "JsThrew"               // JsInline step threw inside the sandbox.
    | "Unknown";              // Caller did not classify — last resort.

export interface SelectorAttempt {
    readonly SelectorId: number | null;
    readonly Strategy: string;             // "XPathFull" | "XPathRelative" | "Css" | "Aria" | …
    readonly Expression: string;           // Stored expression (may be relative).
    readonly ResolvedExpression: string;   // Anchor-joined expression actually evaluated.
    readonly IsPrimary: boolean;
    readonly Matched: boolean;
    readonly MatchCount: number;
    readonly FailureReason: AttemptFailureReason | "NotEvaluated";
    readonly FailureDetail: string | null;
}

export interface DomContext {
    readonly TagName: string;
    readonly Id: string | null;
    readonly ClassName: string | null;
    readonly AriaLabel: string | null;
    readonly Name: string | null;
    readonly Type: string | null;
    readonly TextSnippet: string;
    readonly OuterHtmlSnippet: string;
}

export interface FailureReport {
    readonly Phase: FailurePhase;
    readonly Message: string;
    readonly Reason: FailureReasonCode;
    readonly ReasonDetail: string;
    readonly StackTrace: string | null;
    readonly StepId: number | null;
    readonly Index: number | null;
    readonly StepKind: string | null;
    readonly Selectors: ReadonlyArray<SelectorAttempt>;
    readonly DomContext: DomContext | null;
    readonly DataRow: FieldRow | null;
    readonly ResolvedXPath: string | null;
    readonly Timestamp: string;
    readonly SourceFile: string;
}

export interface BuildFailureReportInput {
    readonly Phase: FailurePhase;
    readonly Error: unknown;
    readonly StepId?: number;
    readonly Index?: number;
    readonly StepKind?: string;
    /**
     * Persisted selectors as stored in the per-project DB. Used as a
     * fallback when `EvaluatedAttempts` is not supplied (e.g. Record
     * phase, where no live DOM evaluation happened).
     */
    readonly Selectors?: ReadonlyArray<PersistedSelector>;
    /**
     * Live-DOM evaluation outcomes, one per selector. When present this
     * supersedes `Selectors` because it carries Matched/MatchCount/Reason
     * per attempt — exactly what AI debuggers need.
     */
    readonly EvaluatedAttempts?: ReadonlyArray<EvaluatedAttempt>;
    readonly Target?: Element | null;
    readonly DataRow?: FieldRow;
    readonly ResolvedXPath?: string;
    readonly SourceFile: string;        // e.g. "src/background/recorder/live-dom-replay.ts"
    /** Caller-supplied classification. Auto-derived from attempts when omitted. */
    readonly Reason?: FailureReasonCode;
    readonly ReasonDetail?: string;
    readonly Now?: () => Date;
}

const SELECTOR_KIND_NAMES: Readonly<Record<number, string>> = {
    1: "XPathFull",
    2: "XPathRelative",
    3: "Css",
    4: "Aria",
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function buildFailureReport(input: BuildFailureReportInput): FailureReport {
    const now = input.Now ?? defaultNow;
    const message = extractMessage(input.Error);
    const stack = extractStack(input.Error);

    const attempts: ReadonlyArray<SelectorAttempt> =
        input.EvaluatedAttempts !== undefined
            ? input.EvaluatedAttempts.map(toAttemptFromEvaluated)
            : (input.Selectors ?? []).map(toAttemptFromPersisted);

    const { Reason, ReasonDetail } = classifyReason(input, attempts, message);

    return {
        Phase: input.Phase,
        Message: message,
        Reason,
        ReasonDetail,
        StackTrace: stack,
        StepId: input.StepId ?? null,
        Index: input.Index ?? null,
        StepKind: input.StepKind ?? null,
        Selectors: attempts,
        DomContext: input.Target ? readDomContext(input.Target) : null,
        DataRow: input.DataRow ?? null,
        ResolvedXPath: input.ResolvedXPath ?? null,
        Timestamp: now().toISOString(),
        SourceFile: input.SourceFile,
    };
}

/**
 * Auto-classify the failure when the caller did not supply a Reason. The
 * input attempts (one per persisted selector, primary-first) drive the
 * classification:
 *
 *   - No selectors                 → "NoSelectors"
 *   - Any attempt threw XPath      → "XPathSyntaxError"
 *   - Any attempt threw CSS        → "CssSyntaxError"
 *   - Any anchor unresolved        → "UnresolvedAnchor"
 *   - Any expression empty         → "EmptyExpression"
 *   - Primary missed, fallback OK  → "PrimaryMissedFallbackOk"
 *   - All attempts returned 0      → "ZeroMatches"
 *   - Otherwise                    → "Unknown"
 */
function classifyReason(
    input: BuildFailureReportInput,
    attempts: ReadonlyArray<SelectorAttempt>,
    message: string,
): { Reason: FailureReasonCode; ReasonDetail: string } {
    if (input.Reason !== undefined) {
        return {
            Reason: input.Reason,
            ReasonDetail: input.ReasonDetail ?? message,
        };
    }
    if (attempts.length === 0) {
        return { Reason: "NoSelectors", ReasonDetail: "Step has no persisted selectors to try." };
    }
    const reasons = new Set(attempts.map((a) => a.FailureReason));
    if (reasons.has("XPathSyntaxError")) {
        return { Reason: "XPathSyntaxError", ReasonDetail: firstDetail(attempts, "XPathSyntaxError") };
    }
    if (reasons.has("CssSyntaxError")) {
        return { Reason: "CssSyntaxError", ReasonDetail: firstDetail(attempts, "CssSyntaxError") };
    }
    if (reasons.has("UnresolvedAnchor")) {
        return { Reason: "UnresolvedAnchor", ReasonDetail: firstDetail(attempts, "UnresolvedAnchor") };
    }
    if (reasons.has("EmptyExpression")) {
        return { Reason: "EmptyExpression", ReasonDetail: firstDetail(attempts, "EmptyExpression") };
    }
    const primary = attempts.find((a) => a.IsPrimary) ?? null;
    const anyFallbackMatched = attempts.some((a) => !a.IsPrimary && a.Matched);
    if (primary !== null && !primary.Matched && anyFallbackMatched) {
        return {
            Reason: "PrimaryMissedFallbackOk",
            ReasonDetail:
                `Primary selector '${primary.ResolvedExpression}' missed; ` +
                `${attempts.filter((a) => !a.IsPrimary && a.Matched).length} fallback(s) matched.`,
        };
    }
    if (attempts.every((a) => !a.Matched && a.MatchCount === 0)) {
        return {
            Reason: "ZeroMatches",
            ReasonDetail:
                `All ${attempts.length} selector(s) returned 0 nodes. ` +
                `Tried: ${attempts.map((a) => a.ResolvedExpression).join(" | ")}`,
        };
    }
    return { Reason: "Unknown", ReasonDetail: message };
}

function firstDetail(attempts: ReadonlyArray<SelectorAttempt>, code: AttemptFailureReason | "NotEvaluated"): string {
    const hit = attempts.find((a) => a.FailureReason === code);
    return hit?.FailureDetail ?? `Attempt failed with ${code}.`;
}

/**
 * Serializes a report to a multi-line block suitable for `console.error` or
 * a clipboard paste into AI chat. Format:
 *
 * ```
 * [MarcoReplay] Element not found for selector '#go'
 *   Reason: PrimaryMissedFallbackOk — Primary missed; 1 fallback matched.
 *   at src/background/recorder/live-dom-replay.ts (StepId=42, Index=3)
 *   Selectors:
 *     ✗ ✓ XPathFull   //button[@id='go'] → 0 matches (ZeroMatches: …)
 *     ✓ · Css         #go                → 1 matches
 *   at src/background/recorder/live-dom-replay.ts (StepId=42, Index=3)
 *   Selectors:
 *     ✓ XPathFull   //button[@id='go']
 *     · Css         #go
 *   DomContext: <button id="go" class="primary"> "Go"
 *   DataRow: { "Email": "alice@example.com" }
 *   Stack:
 *     <stack lines>
 * ```
 */
export function formatFailureReport(report: FailureReport): string {
    const tag = `[Marco${report.Phase}]`;
    const lines: string[] = [];
    lines.push(`${tag} ${report.Message}`);

    const where: string[] = [`at ${report.SourceFile}`];
    if (report.StepId !== null) where.push(`StepId=${report.StepId}`);
    if (report.Index !== null)  where.push(`Index=${report.Index}`);
    if (report.StepKind !== null) where.push(`Kind=${report.StepKind}`);
    lines.push(`  ${where.join(" ")}`);

    if (report.Selectors.length > 0) {
        lines.push("  Selectors:");
        for (const s of report.Selectors) {
            const mark = s.IsPrimary ? "✓" : "·";
            lines.push(`    ${mark} ${s.Kind.padEnd(13)} ${s.Expression}`);
        }
    }

    if (report.ResolvedXPath !== null) {
        lines.push(`  ResolvedXPath: ${report.ResolvedXPath}`);
    }

    if (report.DomContext !== null) {
        const ctx = report.DomContext;
        const attrs: string[] = [];
        if (ctx.Id !== null)        attrs.push(`id="${ctx.Id}"`);
        if (ctx.ClassName !== null) attrs.push(`class="${ctx.ClassName}"`);
        if (ctx.Name !== null)      attrs.push(`name="${ctx.Name}"`);
        if (ctx.Type !== null)      attrs.push(`type="${ctx.Type}"`);
        if (ctx.AriaLabel !== null) attrs.push(`aria-label="${ctx.AriaLabel}"`);
        const attrStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
        const text = ctx.TextSnippet.length > 0 ? ` "${ctx.TextSnippet}"` : "";
        lines.push(`  DomContext: <${ctx.TagName}${attrStr}>${text}`);
    }

    if (report.DataRow !== null) {
        lines.push(`  DataRow: ${JSON.stringify(report.DataRow)}`);
    }

    if (report.StackTrace !== null) {
        lines.push("  Stack:");
        for (const line of report.StackTrace.split("\n")) {
            lines.push(`    ${line.trim()}`);
        }
    }

    return lines.join("\n");
}

/**
 * Single entry point used by both pipelines. Writes the structured report
 * to `console.error` with the phase prefix and returns the report so the
 * caller can persist `JSON.stringify(report)` into the project DB and/or
 * surface a copy-to-clipboard toast.
 */
export function logFailure(input: BuildFailureReportInput): FailureReport {
    const report = buildFailureReport(input);
    // eslint-disable-next-line no-console
    console.error(formatFailureReport(report));
    return report;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try { return JSON.stringify(err); } catch { return String(err); }
}

function extractStack(err: unknown): string | null {
    if (err instanceof Error && typeof err.stack === "string") return err.stack;
    return null;
}

function toSelectorAttempt(s: PersistedSelector): SelectorAttempt {
    return {
        Kind: SELECTOR_KIND_NAMES[s.SelectorKindId] ?? `Kind${s.SelectorKindId}`,
        Expression: s.Expression,
        IsPrimary: s.IsPrimary === 1,
    };
}

function readDomContext(el: Element): DomContext {
    const id = el.getAttribute("id");
    const cls = el.getAttribute("class");
    const aria = el.getAttribute("aria-label");
    const name = el.getAttribute("name");
    const type = el.getAttribute("type");
    const text = (el.textContent ?? "").trim().slice(0, 120);
    const outer = el.outerHTML?.slice(0, 240) ?? "";
    return {
        TagName: el.tagName.toLowerCase(),
        Id: id !== null && id.length > 0 ? id : null,
        ClassName: cls !== null && cls.length > 0 ? cls : null,
        AriaLabel: aria !== null && aria.length > 0 ? aria : null,
        Name: name !== null && name.length > 0 ? name : null,
        Type: type !== null && type.length > 0 ? type : null,
        TextSnippet: text,
        OuterHtmlSnippet: outer,
    };
}

function defaultNow(): Date {
    return new Date();
}
