// @vitest-environment jsdom

/**
 * Marco Extension — Instruction → FailureReport Schema Tests
 *
 * Validates that failures emitted by the three new instruction families
 * introduced by spec 19 (and their backing modules from specs 17/18)
 * conform to the canonical `FailureReport` schema enforced at build time
 * by `scripts/check-failure-log-schema.mjs` AND at runtime by
 * `validateFailureReportPayload`.
 *
 * Coverage axes:
 *
 *   1. **UrlTabClick** — every UrlTabClickReason value produces a report
 *      whose required fields are present, correctly typed, and the
 *      report passes `validateFailureReportPayload` (single-report and
 *      bundle shape).
 *   2. **Element-appearance Wait / Gate** — `ConditionWaitOutcome` with
 *      Ok=false maps to a report carrying the serialized condition tree
 *      and a non-empty LastEvaluation trace.
 *   3. **XPath/CSS Conditional rules** — single-leaf predicate failures
 *      classify into XPathSyntaxError / CssSyntaxError / ZeroMatches /
 *      Timeout based on selector dialect + reason.
 *
 * Conformance:
 *   - mem://standards/verbose-logging-and-failure-diagnostics
 *   - spec/31-macro-recorder/19-url-tabs-appearance-waits-conditions.md
 *   - scripts/check-failure-log-schema.mjs (build-time twin)
 */

import { describe, expect, it } from "vitest";
import type { FailureReport } from "../failure-logger";
import { validateFailureReportPayload } from "../../../components/recorder/failure-report-validator";
import {
    buildConditionFailureReport,
    buildSelectorPredicateFailureReport,
    buildUrlTabClickFailureReport,
    type UrlTabClickReason,
} from "../instruction-failure-adapters";
import {
    evaluateCondition,
    type Condition,
    type PredicateEvaluation,
} from "../condition-evaluator";

/** Stable clock so timestamps are deterministic across runs. */
const FIXED_NOW = (): Date => new Date("2026-04-26T10:00:00.000Z");

/**
 * MUST stay in lockstep with `REQUIRED_REPORT_FIELDS` in
 * `scripts/check-failure-log-schema.mjs` and the spec map in
 * `src/components/recorder/failure-report-validator.ts`.
 */
const REQUIRED_REPORT_FIELDS: ReadonlyArray<keyof FailureReport> = [
    "Phase",
    "Reason",
    "ReasonDetail",
    "StackTrace",
    "StepId",
    "Index",
    "StepKind",
    "Selectors",
    "Variables",
    "DomContext",
    "ResolvedXPath",
    "Timestamp",
    "SourceFile",
    "Verbose",
];

function assertRequiredFieldsPresent(report: FailureReport): void {
    for (const field of REQUIRED_REPORT_FIELDS) {
        expect(
            Object.prototype.hasOwnProperty.call(report, field),
            `Missing required field '${String(field)}'`,
        ).toBe(true);
    }
}

function assertValidatesAsSingleReport(report: FailureReport): void {
    const result = validateFailureReportPayload(report);
    expect(result.Valid, `validator says: ${result.Summary}`).toBe(true);
    expect(result.RootIssues).toHaveLength(0);
    expect(result.ReportIssues).toHaveLength(0);
}

function assertValidatesAsBundle(reports: ReadonlyArray<FailureReport>): void {
    const bundle = {
        Generator: "instruction-failure-adapters.test",
        Version: "1.0.0",
        ExportedAt: "2026-04-26T10:00:00.000Z",
        Count: reports.length,
        Reports: reports,
    };
    const result = validateFailureReportPayload(bundle);
    expect(result.Valid, `bundle invalid: ${result.Summary}`).toBe(true);
    expect(result.ReportsChecked).toBe(reports.length);
}

/* ================================================================== */
/*  UrlTabClick                                                        */
/* ================================================================== */

const URL_TAB_CLICK_REASONS: ReadonlyArray<UrlTabClickReason> = [
    "UrlTabClickTimeout",
    "TabNotFound",
    "InvalidUrlPattern",
    "SelectorNotFound",
    "UrlPatternMismatch",
];

/**
 * Canonical (UrlTabClickReason → FailureReport.Reason) mapping enforced by
 * `buildUrlTabClickFailureReport`. The adapter ONLY promotes the dedicated
 * timeout to the schema's `Timeout` reason; everything else degrades to
 * `Unknown` so the rich reason code is preserved verbatim in `ReasonDetail`
 * (where the validator panel renders it).
 */
const URL_TAB_CLICK_REASON_MAPPING: Readonly<Record<UrlTabClickReason, string>> = {
    UrlTabClickTimeout: "Timeout",
    TabNotFound:        "Unknown",
    InvalidUrlPattern:  "Unknown",
    SelectorNotFound:   "Unknown",
    UrlPatternMismatch: "Unknown",
};

const URL_TAB_CLICK_SOURCE_FILE = "src/background/recorder/url-tab-click.ts";

describe("UrlTabClick → FailureReport", () => {
    it.each(URL_TAB_CLICK_REASONS)(
        "%s sets Phase=Replay, StepKind=UrlTabClick, SourceFile=url-tab-click.ts and the canonical Reason mapping",
        (reason) => {
            const report = buildUrlTabClickFailureReport({
                Failure: {
                    Reason: reason,
                    Detail: `simulated ${reason}`,
                    UrlPattern: "https://app.example.com/orders/*",
                    UrlMatch: "Glob",
                    Mode: "OpenOrFocus",
                    ObservedUrl: "https://app.example.com/orders/42",
                    Selector: "a.open-orders",
                    SelectorKind: "Css",
                    TimeoutMs: 5_000,
                    DurationMs: 5_001,
                },
                StepId: 901,
                Index: 3,
                Now: FIXED_NOW,
            });

            assertRequiredFieldsPresent(report);
            assertValidatesAsSingleReport(report);

            // Phase: every adapter emits replay-time failures only.
            expect(report.Phase).toBe("Replay");
            // StepKind: hard-pinned to the family name (NOT user-supplied).
            expect(report.StepKind).toBe("UrlTabClick");
            // SourceFile: exact literal — protects against accidental rename.
            expect(report.SourceFile).toBe(URL_TAB_CLICK_SOURCE_FILE);
            // Reason: pulled from the canonical mapping table so future drift
            // (e.g. promoting SelectorNotFound to a real Reason) forces the
            // contract update to be explicit.
            expect(report.Reason).toBe(URL_TAB_CLICK_REASON_MAPPING[reason]);
            // ReasonDetail must surface the full URL-tab-click diagnostic block.
            expect(report.ReasonDetail).toContain(`Reason=${reason}`);
            expect(report.ReasonDetail).toContain("UrlMatch=Glob");
            expect(report.ReasonDetail).toContain("Pattern=https://app.example.com/orders/*");
            expect(report.ReasonDetail).toContain("ObservedUrl=https://app.example.com/orders/42");
        },
    );

    it("non-verbose report omits CapturedHtml", () => {
        const report = buildUrlTabClickFailureReport({
            Failure: {
                Reason: "TabNotFound",
                Detail: "no match",
                UrlPattern: "https://x.test/",
                UrlMatch: "Exact",
                Mode: "FocusExisting",
                TimeoutMs: 1000,
                DurationMs: 1000,
            },
            StepId: 1, Index: 0, Now: FIXED_NOW,
        });
        expect(report.Verbose).toBe(false);
        expect(report.CapturedHtml).toBeNull();
    });

    it("a bundle of multiple UrlTabClick reports validates as a bundle", () => {
        const reports = URL_TAB_CLICK_REASONS.map((reason, i) =>
            buildUrlTabClickFailureReport({
                Failure: {
                    Reason: reason,
                    Detail: reason,
                    UrlPattern: "https://x.test/*",
                    UrlMatch: "Glob",
                    Mode: "OpenNew",
                    TimeoutMs: 1000,
                    DurationMs: 1000,
                },
                StepId: 1000 + i, Index: i, Now: FIXED_NOW,
            }),
        );
        assertValidatesAsBundle(reports);
    });
});

/* ================================================================== */
/*  Wait / Gate condition failures                                     */
/* ================================================================== */

const SAMPLE_COMPOUND_CONDITION: Condition = {
    All: [
        { Selector: "//button[@id='submit']", Matcher: { Kind: "Visible" } },
        { Not: { Selector: ".loading", Matcher: { Kind: "Visible" } } },
    ],
};

describe("Condition wait → FailureReport (Gate / WaitFor / ConditionStep)", () => {
    it("ConditionTimeout from a Gate maps to Reason=Timeout and includes serialized tree", () => {
        const report = buildConditionFailureReport({
            Outcome: {
                Ok: false,
                DurationMs: 2050,
                Polls: 41,
                Reason: "ConditionTimeout",
                Detail: "Condition not met within 2000ms",
                LastEvaluation: [
                    {
                        Selector: "//button[@id='submit']",
                        Kind: "XPath",
                        Matcher: "Visible",
                        Result: false,
                        Detail: "no match",
                    },
                    {
                        Selector: ".loading",
                        Kind: "Css",
                        Matcher: "Visible",
                        Result: true,
                    },
                ],
            },
            Condition: SAMPLE_COMPOUND_CONDITION,
            Source: "Gate",
            StepId: 77,
            Index: 4,
            StepKind: "Click",
            DataRow: { orderId: "42" },
            Now: FIXED_NOW,
        });

        assertRequiredFieldsPresent(report);
        assertValidatesAsSingleReport(report);

        expect(report.Reason).toBe("Timeout");
        expect(report.StepKind).toBe("Click");
        expect(report.SourceFile).toContain("condition-evaluator.ts");
        // Serialized condition + last evaluation trace MUST be in the detail.
        expect(report.ReasonDetail).toContain("Reason=ConditionTimeout");
        expect(report.ReasonDetail).toContain("Source=Gate");
        expect(report.ReasonDetail).toContain("Polls=41");
        expect(report.ReasonDetail).toContain("ConditionSerialized:");
        expect(report.ReasonDetail).toContain("//button[@id='submit']");
        expect(report.ReasonDetail).toContain(".loading");
        expect(report.ReasonDetail).toContain("XPath '//button[@id='submit']' Visible=false");
        expect(report.ReasonDetail).toContain("Css '.loading' Visible=true");
        // DataRow round-trips into the report.
        expect(report.DataRow).toEqual({ orderId: "42" });
    });

    it("InvalidSelector from a Condition step maps to Reason=Unknown but stays schema-conformant", () => {
        const report = buildConditionFailureReport({
            Outcome: {
                Ok: false,
                DurationMs: 0,
                Polls: 0,
                Reason: "InvalidSelector",
                Detail: "InvalidSelector: bad regex /(unclosed/ — Unterminated group",
                LastEvaluation: [],
            },
            Condition: {
                Selector: "#x",
                Matcher: { Kind: "TextRegex", Pattern: "(unclosed" },
            },
            Source: "ConditionStep",
            StepId: 88,
            Index: 5,
            StepKind: "Condition",
            Now: FIXED_NOW,
        });

        assertRequiredFieldsPresent(report);
        assertValidatesAsSingleReport(report);
        expect(report.Reason).toBe("Unknown");
        expect(report.ReasonDetail).toContain("Reason=InvalidSelector");
        expect(report.ReasonDetail).toContain("Source=ConditionStep");
        expect(report.SourceFile).toContain("condition-step.ts");
        // Empty trace renders as "(empty)" so AI debuggers see something.
        expect(report.ReasonDetail).toContain("(empty)");
    });

    it("legacy WaitFor source points at wait-for-element.ts SourceFile", () => {
        const report = buildConditionFailureReport({
            Outcome: {
                Ok: false,
                DurationMs: 1000,
                Polls: 20,
                Reason: "ConditionTimeout",
                Detail: "WaitFor '#go' timed out after 1000ms",
                LastEvaluation: [{
                    Selector: "#go", Kind: "Css", Matcher: "Exists", Result: false,
                    Detail: "no match",
                }],
            },
            Condition: { Selector: "#go", Matcher: { Kind: "Exists" } },
            Source: "Wait",
            StepId: 1, Index: 0, StepKind: "Wait",
            Now: FIXED_NOW,
        });
        assertValidatesAsSingleReport(report);
        expect(report.SourceFile).toContain("wait-for-element.ts");
    });
});

/* ================================================================== */
/*  XPath / CSS conditional element rules                              */
/* ================================================================== */

describe("Selector predicate → FailureReport", () => {
    it("malformed XPath classifies as XPathSyntaxError", () => {
        const report = buildSelectorPredicateFailureReport({
            Selector: "//div[unterminated",
            SelectorKind: "Auto",
            Reason: "InvalidSelector",
            Detail: "XPath parse error",
            StepId: 1, Index: 0,
            StepKind: "Click",
            Now: FIXED_NOW,
        });
        assertRequiredFieldsPresent(report);
        assertValidatesAsSingleReport(report);
        expect(report.Reason).toBe("XPathSyntaxError");
        expect(report.ReasonDetail).toContain("Kind=XPath");
    });

    it("malformed CSS classifies as CssSyntaxError", () => {
        const report = buildSelectorPredicateFailureReport({
            Selector: "div[unterminated",
            SelectorKind: "Auto",
            Reason: "InvalidSelector",
            Detail: "CSS parse error",
            StepId: 2, Index: 1,
            StepKind: "Click",
            Now: FIXED_NOW,
        });
        assertRequiredFieldsPresent(report);
        assertValidatesAsSingleReport(report);
        expect(report.Reason).toBe("CssSyntaxError");
        expect(report.ReasonDetail).toContain("Kind=Css");
    });

    it("ZeroMatches predicate keeps the canonical reason code", () => {
        const report = buildSelectorPredicateFailureReport({
            Selector: "#never",
            Reason: "ZeroMatches",
            Detail: "no match",
            StepId: 3, Index: 2,
            StepKind: "Wait",
            Now: FIXED_NOW,
        });
        assertRequiredFieldsPresent(report);
        assertValidatesAsSingleReport(report);
        expect(report.Reason).toBe("ZeroMatches");
        expect(report.ReasonDetail).toContain("LastEvaluation:");
        expect(report.ReasonDetail).toContain("[0] Css '#never' Exists=false");
    });

    it("ConditionTimeout on a single predicate maps to Timeout", () => {
        const report = buildSelectorPredicateFailureReport({
            Selector: "/html/body/main",
            SelectorKind: "Auto",
            Reason: "ConditionTimeout",
            Detail: "Condition not met within 5000ms",
            StepId: 4, Index: 3,
            StepKind: "Wait",
            Now: FIXED_NOW,
        });
        assertRequiredFieldsPresent(report);
        assertValidatesAsSingleReport(report);
        expect(report.Reason).toBe("Timeout");
        // Auto-detection picked XPath because of the leading slash.
        expect(report.ReasonDetail).toContain("Kind=XPath");
    });

    it("a mixed bundle of all three instruction families validates as a bundle", () => {
        const reports = [
            buildUrlTabClickFailureReport({
                Failure: {
                    Reason: "UrlTabClickTimeout",
                    Detail: "tab never resolved",
                    UrlPattern: "https://x.test/*",
                    UrlMatch: "Glob",
                    Mode: "OpenNew",
                    TimeoutMs: 1000,
                    DurationMs: 1001,
                },
                StepId: 10, Index: 0, Now: FIXED_NOW,
            }),
            buildConditionFailureReport({
                Outcome: {
                    Ok: false, DurationMs: 50, Polls: 1,
                    Reason: "ConditionTimeout", Detail: "no",
                    LastEvaluation: [{
                        Selector: "#x", Kind: "Css", Matcher: "Exists", Result: false,
                    }],
                },
                Condition: { Selector: "#x", Matcher: { Kind: "Exists" } },
                Source: "Gate", StepId: 11, Index: 1, StepKind: "Click",
                Now: FIXED_NOW,
            }),
            buildSelectorPredicateFailureReport({
                Selector: "//bad[",
                Reason: "InvalidSelector",
                Detail: "parse error",
                StepId: 12, Index: 2, StepKind: "Wait",
                Now: FIXED_NOW,
            }),
        ];
        assertValidatesAsBundle(reports);
    });
});

/* ================================================================== */
/*  UrlTabClick — optional-field matrix                                 */
/*                                                                      */
/*  Every optional field on `UrlTabClickFailure` (`ObservedUrl`,        */
/*  `Selector`, `SelectorKind`) must be safely omittable. The adapter   */
/*  must:                                                               */
/*    1. Never produce a report whose `ReasonDetail` carries the literal*/
/*       string "undefined" (would happen if the serializer interpolated*/
/*       missing fields without a guard).                               */
/*    2. Always emit a `ReasonDetail` that satisfies the canonical      */
/*       schema (string-typed, non-empty).                              */
/*    3. Always omit-not-stub the optional `*=` segments so downstream  */
/*       parsers can rely on `Selector=` only appearing when one was    */
/*       actually supplied.                                             */
/* ================================================================== */

/**
 * Cartesian matrix of "is this optional field present?" — eight rows.
 * Keeps inputs explicit so a regression in the omission logic surfaces
 * with a clear test name rather than a single combined assertion.
 */
interface OptionalCase {
    readonly Label: string;
    readonly ObservedUrl?: string;
    readonly Selector?: string;
    readonly SelectorKind?: "Auto" | "XPath" | "Css";
}

const OPTIONAL_CASES: ReadonlyArray<OptionalCase> = [
    { Label: "all optionals omitted" },
    { Label: "ObservedUrl only", ObservedUrl: "https://x.test/now" },
    { Label: "Selector only", Selector: "button.go" },
    { Label: "SelectorKind only (no Selector)", SelectorKind: "XPath" },
    { Label: "Selector + SelectorKind", Selector: "//button", SelectorKind: "XPath" },
    { Label: "ObservedUrl + Selector", ObservedUrl: "https://x.test/now", Selector: "button.go" },
    { Label: "ObservedUrl + SelectorKind", ObservedUrl: "https://x.test/now", SelectorKind: "Css" },
    {
        Label: "all three present",
        ObservedUrl: "https://x.test/now",
        Selector: "button.go",
        SelectorKind: "Css",
    },
];

describe("UrlTabClick optional fields — schema conformance", () => {
    it.each(OPTIONAL_CASES)(
        "$Label: produces a schema-valid report with a clean ReasonDetail",
        (kase) => {
            const report = buildUrlTabClickFailureReport({
                Failure: {
                    Reason: "TabNotFound",
                    Detail: "no matching tab",
                    UrlPattern: "https://x.test/*",
                    UrlMatch: "Glob",
                    Mode: "OpenOrFocus",
                    TimeoutMs: 1_000,
                    DurationMs: 1_000,
                    ObservedUrl: kase.ObservedUrl,
                    Selector: kase.Selector,
                    SelectorKind: kase.SelectorKind,
                },
                StepId: 1, Index: 0, Now: FIXED_NOW,
            });

            // 1. Required-field shape (mirrors the build-time schema check).
            assertRequiredFieldsPresent(report);
            assertValidatesAsSingleReport(report);

            // 2. ReasonDetail is a non-empty string and never leaks the literal
            //    word "undefined" — proves the serializer guarded each optional.
            expect(typeof report.ReasonDetail).toBe("string");
            expect(report.ReasonDetail.length).toBeGreaterThan(0);
            expect(report.ReasonDetail).not.toMatch(/\bundefined\b/);
            expect(report.ReasonDetail).not.toMatch(/=undefined/);
            expect(report.ReasonDetail).not.toMatch(/=null/);

            // 3. Required (always-present) segments.
            expect(report.ReasonDetail).toContain("Reason=TabNotFound");
            expect(report.ReasonDetail).toContain("Mode=OpenOrFocus");
            expect(report.ReasonDetail).toContain("UrlMatch=Glob");
            expect(report.ReasonDetail).toContain("Pattern=https://x.test/*");
            expect(report.ReasonDetail).toContain("TimeoutMs=1000");
            expect(report.ReasonDetail).toContain("DurationMs=1000");
            expect(report.ReasonDetail).toContain("Detail=no matching tab");

            // 4. Optional segments appear iff the input field was supplied.
            //    (`includes` substring is fine — the keys are unique.)
            expect(report.ReasonDetail.includes("ObservedUrl="))
                .toBe(kase.ObservedUrl !== undefined);
            expect(report.ReasonDetail.includes("Selector="))
                .toBe(kase.Selector !== undefined);
            expect(report.ReasonDetail.includes("SelectorKind="))
                .toBe(kase.SelectorKind !== undefined);
        },
    );

    it("an empty-string ObservedUrl is preserved verbatim (caller's choice)", () => {
        // Edge case: the caller may legitimately observe an empty URL on a
        // freshly-opened blank tab. We MUST keep the segment so debuggers
        // can distinguish "not supplied" from "supplied as empty".
        const report = buildUrlTabClickFailureReport({
            Failure: {
                Reason: "UrlPatternMismatch",
                Detail: "blank tab opened",
                UrlPattern: "https://x.test/*",
                UrlMatch: "Glob",
                Mode: "OpenNew",
                TimeoutMs: 1_000,
                DurationMs: 5,
                ObservedUrl: "",
            },
            StepId: 1, Index: 0, Now: FIXED_NOW,
        });
        assertValidatesAsSingleReport(report);
        expect(report.ReasonDetail).toContain("ObservedUrl=");
        expect(report.ReasonDetail).not.toContain("ObservedUrl=undefined");
    });

    it("a bundle of every optional-field combination validates as a bundle", () => {
        const reports = OPTIONAL_CASES.map((kase, i) =>
            buildUrlTabClickFailureReport({
                Failure: {
                    Reason: "TabNotFound",
                    Detail: kase.Label,
                    UrlPattern: "https://x.test/*",
                    UrlMatch: "Glob",
                    Mode: "OpenOrFocus",
                    TimeoutMs: 1_000,
                    DurationMs: 1_000,
                    ObservedUrl: kase.ObservedUrl,
                    Selector: kase.Selector,
                    SelectorKind: kase.SelectorKind,
                },
                StepId: 2_000 + i, Index: i, Now: FIXED_NOW,
            }),
        );
        assertValidatesAsBundle(reports);
    });

    it("DataRow is preserved when supplied alongside missing optionals", () => {
        // Regression guard: combining present-DataRow + absent-Selector must
        // not corrupt either the DataRow round-trip or the omission logic.
        const report = buildUrlTabClickFailureReport({
            Failure: {
                Reason: "TabNotFound",
                Detail: "row context test",
                UrlPattern: "https://x.test/*",
                UrlMatch: "Glob",
                Mode: "OpenOrFocus",
                TimeoutMs: 1_000,
                DurationMs: 1_000,
                // No Selector / SelectorKind / ObservedUrl.
            },
            StepId: 1, Index: 0,
            DataRow: { OrderId: "42", Status: "pending" },
            Now: FIXED_NOW,
        });
        assertValidatesAsSingleReport(report);
        expect(report.DataRow).toEqual({ OrderId: "42", Status: "pending" });
        expect(report.ReasonDetail).not.toContain("Selector=");
        expect(report.ReasonDetail).not.toContain("ObservedUrl=");
        expect(report.ReasonDetail).not.toContain("SelectorKind=");
    });
});

/* ================================================================== */
/*  LastEvaluation predicate-order preservation                         */
/*                                                                      */
/*  Nested AND/OR/NOT trees evaluate predicates in a deterministic       */
/*  left-to-right, depth-first order with short-circuiting (AND stops   */
/*  on first false, OR stops on first true). The `LastEvaluation`       */
/*  trace MUST reflect that exact visit order, and the rendered         */
/*  `LastEvaluation:` block in `ReasonDetail` MUST emit one `[i]` line  */
/*  per trace entry in the SAME order with sequential indices starting  */
/*  at 0. Any drift (alphabetisation, dedup, reorder, missing entry,    */
/*  off-by-one index) breaks the AI debugger contract documented at     */
/*  mem://standards/verbose-logging-and-failure-diagnostics.            */
/* ================================================================== */

describe("LastEvaluation order preservation in ReasonDetail", () => {
    /** Pull every "  [i] Kind 'sel' Matcher=bool ..." line out of the detail. */
    function extractTraceLines(detail: string): string[] {
        const lines = detail.split("\n");
        const start = lines.findIndex((l) => l === "LastEvaluation:");
        expect(start, "LastEvaluation: header missing").toBeGreaterThanOrEqual(0);
        const out: string[] = [];
        for (let i = start + 1; i < lines.length; i++) {
            const l = lines[i]!;
            if (l.startsWith("ConditionSerialized:")) break;
            out.push(l);
        }
        return out;
    }

    /** Parse the leading `  [N] ` index out of a rendered trace line. */
    function indexOf(line: string): number {
        const m = /^ {2}\[(\d+)\] /.exec(line);
        expect(m, `line lacks "  [N] " prefix: ${line}`).not.toBeNull();
        return Number(m![1]);
    }

    it("nested All(Any, Not, leaf) preserves left-to-right depth-first order with short-circuit", () => {
        // Stage a DOM where:
        //   #alpha   → missing  (Any branch leaf 1, visited, false)
        //   #beta    → present  (Any branch leaf 2, visited, true → Any=true, All continues)
        //   #gamma   → missing  (Not(missing)=true, visited → All continues)
        //   #delta   → missing  (visited, false → All short-circuits to false)
        //   #epsilon → present  (NEVER evaluated, must NOT appear in trace)
        document.body.innerHTML = `
            <div id="beta"></div>
            <div id="epsilon"></div>
        `;

        const condition: Condition = {
            All: [
                {
                    Any: [
                        { Selector: "#alpha", Matcher: { Kind: "Exists" } },
                        { Selector: "#beta",  Matcher: { Kind: "Exists" } },
                    ],
                },
                { Not: { Selector: "#gamma", Matcher: { Kind: "Exists" } } },
                { Selector: "#delta",   Matcher: { Kind: "Exists" } },
                // #epsilon MUST NOT be visited because the leaf above already
                // short-circuited the surrounding All to false.
                { Selector: "#epsilon", Matcher: { Kind: "Exists" } },
            ],
        };

        const trace: PredicateEvaluation[] = [];
        const result = evaluateCondition(condition, { Doc: document, Trace: trace });
        expect(result).toBe(false);

        // Sanity: the evaluator visited exactly alpha, beta, gamma, delta — in that order.
        expect(trace.map((p) => p.Selector)).toEqual(
            ["#alpha", "#beta", "#gamma", "#delta"],
        );
        expect(trace.some((p) => p.Selector === "#epsilon")).toBe(false);

        const report = buildConditionFailureReport({
            Outcome: {
                Ok: false,
                DurationMs: 120,
                Polls: 3,
                Reason: "ConditionTimeout",
                Detail: "compound condition not met",
                LastEvaluation: trace,
            },
            Condition: condition,
            Source: "Gate",
            StepId: 101,
            Index: 7,
            StepKind: "Click",
            Now: FIXED_NOW,
        });
        assertValidatesAsSingleReport(report);

        const traceLines = extractTraceLines(report.ReasonDetail);

        // 1) Same number of lines as trace entries — no drops, no dupes.
        expect(traceLines).toHaveLength(trace.length);

        // 2) Indices are sequential starting at 0 (no alphabetisation/reorder).
        expect(traceLines.map(indexOf)).toEqual([0, 1, 2, 3]);

        // 3) Selector order in the rendered lines mirrors the trace order EXACTLY.
        expect(traceLines[0]).toContain("'#alpha'");
        expect(traceLines[1]).toContain("'#beta'");
        expect(traceLines[2]).toContain("'#gamma'");
        expect(traceLines[3]).toContain("'#delta'");

        // 4) The unreached predicate must not leak into the rendered detail's
        //    LastEvaluation block (it is still allowed in ConditionSerialized).
        for (const line of traceLines) expect(line).not.toContain("'#epsilon'");

        // 5) Cross-check raw substring order in the full ReasonDetail string —
        //    catches any future formatter that re-sorts lines after the fact.
        const detail = report.ReasonDetail;
        const aIdx = detail.indexOf("'#alpha'");
        const bIdx = detail.indexOf("'#beta'");
        const gIdx = detail.indexOf("'#gamma'");
        const dIdx = detail.indexOf("'#delta'");
        expect(aIdx).toBeGreaterThanOrEqual(0);
        expect(aIdx).toBeLessThan(bIdx);
        expect(bIdx).toBeLessThan(gIdx);
        expect(gIdx).toBeLessThan(dIdx);
    });

    it("deeply nested Any(All, Not(Any)) keeps DFS visit order in the rendered trace", () => {
        // Force the OR to fail so EVERY branch is evaluated and recorded.
        //   Branch 1: All[ p1=true, p2=false ]    → false (p1, p2 both visited)
        //   Branch 2: Not(Any[ p3=true, p4=? ])   → Not(true)=false (p3 visited; p4 short-circuited)
        //   Branch 3: p5=false                    → false
        // Final result: false. Visit order: p1, p2, p3, p5.
        document.body.innerHTML = `
            <div id="p1"></div>
            <div id="p3"></div>
        `;

        const condition: Condition = {
            Any: [
                {
                    All: [
                        { Selector: "#p1", Matcher: { Kind: "Exists" } },
                        { Selector: "#p2", Matcher: { Kind: "Exists" } },
                    ],
                },
                {
                    Not: {
                        Any: [
                            { Selector: "#p3", Matcher: { Kind: "Exists" } },
                            { Selector: "#p4", Matcher: { Kind: "Exists" } },
                        ],
                    },
                },
                { Selector: "#p5", Matcher: { Kind: "Exists" } },
            ],
        };

        const trace: PredicateEvaluation[] = [];
        expect(evaluateCondition(condition, { Doc: document, Trace: trace })).toBe(false);
        expect(trace.map((p) => p.Selector)).toEqual(["#p1", "#p2", "#p3", "#p5"]);

        const report = buildConditionFailureReport({
            Outcome: {
                Ok: false,
                DurationMs: 75,
                Polls: 2,
                Reason: "ConditionTimeout",
                Detail: "any-branch never satisfied",
                LastEvaluation: trace,
            },
            Condition: condition,
            Source: "ConditionStep",
            StepId: 202,
            Index: 9,
            StepKind: "Condition",
            Now: FIXED_NOW,
        });
        assertValidatesAsSingleReport(report);

        const traceLines = extractTraceLines(report.ReasonDetail);
        expect(traceLines).toHaveLength(4);
        expect(traceLines.map(indexOf)).toEqual([0, 1, 2, 3]);

        // Selector order matches the deterministic DFS order.
        expect(traceLines[0]).toContain("'#p1'");
        expect(traceLines[1]).toContain("'#p2'");
        expect(traceLines[2]).toContain("'#p3'");
        expect(traceLines[3]).toContain("'#p5'");

        // p4 was short-circuited by the inner Any (p3 was already true) — it
        // must NOT appear in the rendered LastEvaluation block.
        for (const line of traceLines) expect(line).not.toContain("'#p4'");
    });
});

/* ================================================================== */
/*  Cross-family mixed bundle                                           */
/*                                                                      */
/*  Real-world diagnostic exports interleave failures from every         */
/*  instruction family in the order they fired. The export panel and    */
/*  the AI debugger both rely on the bundle-level validator accepting   */
/*  these heterogeneous bundles AS-IS — no per-family pre-bucketing,    */
/*  no shape coercion. This block builds a richer bundle than the       */
/*  smoke-test in `Selector predicate → FailureReport` (which only      */
/*  ships one report per family) and asserts:                            */
/*                                                                      */
/*    1. The composite bundle envelope passes `validateFailureReport-   */
/*       Payload` (Valid=true, zero RootIssues, zero ReportIssues).     */
/*    2. `ReportsChecked` matches `Reports.length` AND the envelope's   */
/*       `Count` field — guarding against silent slicing/dedup.         */
/*    3. Every individual report still validates standalone (catches a  */
/*       regression where a bundle pass would mask per-report rot).     */
/*    4. Report identity is preserved: StepId/Index/Reason values come  */
/*       out of the bundle in the SAME order they went in.              */
/*    5. All three instruction families AND all canonical Reason codes  */
/*       targeted by this task appear at least once: UrlTabClickTimeout,*/
/*       ConditionTimeout, and InvalidSelector (XPath + CSS variants).   */
/* ================================================================== */

describe("Mixed-family bundle (UrlTabClick + ConditionTimeout + InvalidSelector)", () => {
    it("a heterogeneous bundle with multiple variants per family validates end-to-end", () => {
        // ---- 1) UrlTabClick — three different reasons ----------------
        const urlOpenNewTimeout = buildUrlTabClickFailureReport({
            Failure: {
                Reason: "UrlTabClickTimeout",
                Detail: "OpenNew tab never resolved",
                UrlPattern: "https://orders.test/*",
                UrlMatch: "Glob",
                Mode: "OpenNew",
                TimeoutMs: 5_000,
                DurationMs: 5_002,
                ObservedUrl: "about:blank",
            },
            StepId: 100, Index: 0, Now: FIXED_NOW,
        });
        const urlPatternMismatch = buildUrlTabClickFailureReport({
            Failure: {
                Reason: "UrlPatternMismatch",
                Detail: "active tab URL does not match pattern",
                UrlPattern: "https://orders.test/checkout",
                UrlMatch: "Exact",
                Mode: "OpenOrFocus",
                TimeoutMs: 1_000,
                DurationMs: 12,
                ObservedUrl: "https://orders.test/cart",
            },
            StepId: 101, Index: 1, Now: FIXED_NOW,
        });
        const urlSelectorMissing = buildUrlTabClickFailureReport({
            Failure: {
                Reason: "SelectorNotFound",
                Detail: "click target absent in matched tab",
                UrlPattern: "https://orders.test/*",
                UrlMatch: "Glob",
                Mode: "OpenOrFocus",
                TimeoutMs: 2_000,
                DurationMs: 2_001,
                Selector: "button#confirm",
                SelectorKind: "Css",
                ObservedUrl: "https://orders.test/checkout",
            },
            StepId: 102, Index: 2, Now: FIXED_NOW,
        });

        // ---- 2) ConditionTimeout — Gate AND ConditionStep variants ---
        const gateTimeout = buildConditionFailureReport({
            Outcome: {
                Ok: false,
                DurationMs: 2_500,
                Polls: 50,
                Reason: "ConditionTimeout",
                Detail: "compound gate not satisfied within 2500ms",
                LastEvaluation: [
                    {
                        Selector: "//button[@id='go']", Kind: "XPath",
                        Matcher: "Visible", Result: false, Detail: "no match",
                    },
                    {
                        Selector: ".loading", Kind: "Css",
                        Matcher: "Visible", Result: true,
                    },
                ],
            },
            Condition: {
                All: [
                    { Selector: "//button[@id='go']", Matcher: { Kind: "Visible" } },
                    { Not: { Selector: ".loading", Matcher: { Kind: "Visible" } } },
                ],
            },
            Source: "Gate", StepId: 200, Index: 3, StepKind: "Click",
            DataRow: { OrderId: "A-42" },
            Now: FIXED_NOW,
        });
        const conditionStepTimeout = buildConditionFailureReport({
            Outcome: {
                Ok: false,
                DurationMs: 1_000,
                Polls: 20,
                Reason: "ConditionTimeout",
                Detail: "Condition step never satisfied",
                LastEvaluation: [{
                    Selector: "#receipt", Kind: "Css", Matcher: "Exists",
                    Result: false, Detail: "no match",
                }],
            },
            Condition: { Selector: "#receipt", Matcher: { Kind: "Exists" } },
            Source: "ConditionStep", StepId: 201, Index: 4, StepKind: "Condition",
            Now: FIXED_NOW,
        });

        // ---- 3) InvalidSelector — XPath syntax AND CSS syntax --------
        const badXPath = buildSelectorPredicateFailureReport({
            Selector: "//div[unterminated",
            SelectorKind: "Auto",                  // auto-detects XPath
            Reason: "InvalidSelector",
            Detail: "unterminated predicate",
            StepId: 300, Index: 5, StepKind: "Wait",
            Now: FIXED_NOW,
        });
        const badCss = buildSelectorPredicateFailureReport({
            Selector: "div[[broken",
            SelectorKind: "Css",
            Reason: "InvalidSelector",
            Detail: "unexpected '['",
            StepId: 301, Index: 6, StepKind: "Wait",
            Now: FIXED_NOW,
        });

        const reports: ReadonlyArray<FailureReport> = [
            urlOpenNewTimeout,
            urlPatternMismatch,
            urlSelectorMissing,
            gateTimeout,
            conditionStepTimeout,
            badXPath,
            badCss,
        ];

        // (3) Every individual report stands on its own — catches per-report
        //     rot that a bundle-only assertion might mask.
        for (const r of reports) {
            assertRequiredFieldsPresent(r);
            assertValidatesAsSingleReport(r);
        }

        // (1) Composite bundle validates clean.
        const bundle = {
            Generator: "instruction-failure-adapters.test",
            Version: "1.0.0",
            ExportedAt: "2026-04-26T10:00:00.000Z",
            Count: reports.length,
            Reports: reports,
        };
        const result = validateFailureReportPayload(bundle);
        expect(result.Valid, `bundle invalid: ${result.Summary}`).toBe(true);
        expect(result.RootIssues).toHaveLength(0);
        expect(result.ReportIssues).toHaveLength(0);

        // (2) Inspection counters are consistent.
        expect(result.ReportsChecked).toBe(reports.length);
        expect(result.ReportsChecked).toBe(bundle.Count);
        expect(result.Summary).toBe("");

        // (4) Order preservation through the bundle.
        expect(reports.map((r) => r.StepId)).toEqual(
            [100, 101, 102, 200, 201, 300, 301],
        );
        expect(reports.map((r) => r.Index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(reports.map((r) => r.Reason)).toEqual([
            "Timeout",            // UrlTabClickTimeout         → Timeout
            "Unknown",            // UrlPatternMismatch         → Unknown (per adapter contract)
            "Unknown",            // SelectorNotFound           → Unknown (per adapter contract)
            "Timeout",            // Gate ConditionTimeout      → Timeout
            "Timeout",            // ConditionStep timeout      → Timeout
            "XPathSyntaxError",   // bad XPath                  → XPathSyntaxError
            "CssSyntaxError",     // bad CSS                    → CssSyntaxError
        ]);

        // (5) All three families AND every targeted Reason are represented in
        //     the rendered ReasonDetail strings (the canonical reason codes
        //     live in ReasonDetail even when Reason itself maps to Unknown).
        const detailBlob = reports.map((r) => r.ReasonDetail).join("\n---\n");
        expect(detailBlob).toContain("UrlTabClickTimeout");
        expect(detailBlob).toContain("UrlPatternMismatch");
        expect(detailBlob).toContain("SelectorNotFound");
        expect(detailBlob).toContain("ConditionTimeout");
        expect(detailBlob).toContain("InvalidSelector");
        expect(detailBlob).toContain("Source=Gate");
        expect(detailBlob).toContain("Source=ConditionStep");
        expect(detailBlob).toContain("Kind=XPath");
        expect(detailBlob).toContain("Kind=Css");

        // SourceFile fans out across every adapter — catches a regression
        // where one adapter would silently win and stamp every report.
        const sourceFiles = new Set(reports.map((r) => r.SourceFile));
        expect(sourceFiles.has("src/background/recorder/condition-evaluator.ts")).toBe(true);
        expect(sourceFiles.has("src/background/recorder/url-tab-click.ts")).toBe(true);
        // 3 families touched ⇒ ≥2 distinct SourceFiles (XPath/CSS predicate
        // wrapper reuses the condition-evaluator path).
        expect(sourceFiles.size).toBeGreaterThanOrEqual(2);
    });
});
