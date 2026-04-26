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
import type { Condition } from "../condition-evaluator";

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

describe("UrlTabClick → FailureReport", () => {
    it.each(URL_TAB_CLICK_REASONS)(
        "%s emits a schema-conformant report",
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

            expect(report.Phase).toBe("Replay");
            expect(report.StepKind).toBe("UrlTabClick");
            expect(report.SourceFile).toMatch(/url-tab-click\.ts$/);
            expect(report.Reason).toBe(
                reason === "UrlTabClickTimeout" ? "Timeout" : "Unknown",
            );
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
