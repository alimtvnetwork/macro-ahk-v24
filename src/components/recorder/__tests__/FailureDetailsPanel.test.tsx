// @vitest-environment jsdom

/**
 * FailureDetailsPanel — render-output tests.
 *
 * Verifies the panel surfaces the full diagnostic surface from a
 * FailureReport: top-level Reason + ReasonDetail, ResolvedXPath, every
 * SelectorAttempt with its per-attempt FailureReason+Detail, and every
 * VariableContext with name/value/source/reason.
 *
 * No interaction — pure render assertions.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { FailureDetailsPanel } from "../FailureDetailsPanel";
import { buildFailureReport, type FailureReport } from "@/background/recorder/failure-logger";
import type { EvaluatedAttempt } from "@/background/recorder/selector-attempt-evaluator";
import type { VariableContext } from "@/background/recorder/field-reference-resolver";

const FIXED_NOW = (): Date => new Date("2026-04-26T10:00:00.000Z");

function makeReport(overrides: Partial<{
    EvaluatedAttempts: ReadonlyArray<EvaluatedAttempt>;
    Variables: ReadonlyArray<VariableContext>;
    ResolvedXPath: string;
}>): FailureReport {
    return buildFailureReport({
        Phase: "Replay",
        Error: new Error("Element not found for selector '#go'"),
        StepId: 7,
        Index: 2,
        StepKind: "Click",
        SourceFile: "src/background/recorder/live-dom-replay.ts",
        Now: FIXED_NOW,
        EvaluatedAttempts: overrides.EvaluatedAttempts,
        Variables: overrides.Variables,
        ResolvedXPath: overrides.ResolvedXPath,
    });
}

afterEach(() => cleanup());

describe("FailureDetailsPanel", () => {
    it("renders the reason banner with Reason code and ReasonDetail", () => {
        const attempts: ReadonlyArray<EvaluatedAttempt> = [
            {
                SelectorId: 1,
                Strategy: "XPathFull",
                Expression: "//button[@id='go']",
                ResolvedExpression: "//button[@id='go']",
                IsPrimary: true,
                Matched: false,
                MatchCount: 0,
                FailureReason: "ZeroMatches",
                FailureDetail: "Returned 0 nodes",
            },
        ];
        render(<FailureDetailsPanel report={makeReport({ EvaluatedAttempts: attempts })} />);

        const banner = screen.getByTestId("failure-reason-banner");
        expect(banner.dataset.reason).toBe("ZeroMatches");
        expect(banner.dataset.group).toBe("selector");
        expect(banner.textContent).toContain("ZeroMatches");
        expect(banner.textContent).toContain("Returned 0 nodes");
    });

    it("renders every selector attempt with primary flag, match outcome, and FailureDetail", () => {
        const attempts: ReadonlyArray<EvaluatedAttempt> = [
            {
                SelectorId: 1,
                Strategy: "XPathFull",
                Expression: "//button[@id='go']",
                ResolvedExpression: "//button[@id='go']",
                IsPrimary: true,
                Matched: false,
                MatchCount: 0,
                FailureReason: "ZeroMatches",
                FailureDetail: "Returned 0 nodes after wait",
            },
            {
                SelectorId: 2,
                Strategy: "Css",
                Expression: "#go",
                ResolvedExpression: "#go",
                IsPrimary: false,
                Matched: true,
                MatchCount: 1,
                FailureReason: "Matched",
                FailureDetail: null,
            },
        ];
        render(<FailureDetailsPanel report={makeReport({ EvaluatedAttempts: attempts })} />);

        const rows = screen.getAllByTestId("failure-attempt-row");
        expect(rows).toHaveLength(2);

        // Primary failed row
        expect(rows[0].dataset.primary).toBe("true");
        expect(rows[0].dataset.matched).toBe("false");
        expect(rows[0].textContent).toContain("//button[@id='go']");
        expect(rows[0].textContent).toContain("ZeroMatches");
        expect(rows[0].textContent).toContain("Returned 0 nodes after wait");

        // Fallback matched row
        expect(rows[1].dataset.primary).toBe("false");
        expect(rows[1].dataset.matched).toBe("true");
        expect(rows[1].textContent).toContain("#go");
        expect(rows[1].textContent).toContain("1 match");
    });

    it("renders the ResolvedXPath when present", () => {
        const attempts: ReadonlyArray<EvaluatedAttempt> = [
            {
                SelectorId: 1, Strategy: "XPathRelative",
                Expression: "//button", ResolvedExpression: "//div[@id='anchor']//button",
                IsPrimary: true, Matched: false, MatchCount: 0,
                FailureReason: "ZeroMatches", FailureDetail: null,
            },
        ];
        render(<FailureDetailsPanel report={makeReport({
            EvaluatedAttempts: attempts,
            ResolvedXPath: "//div[@id='anchor']//button",
        })} />);

        const row = screen.getByTestId("failure-resolved-xpath");
        expect(row.textContent).toContain("//div[@id='anchor']//button");
    });

    it("renders variables with name, value, type, source, and per-variable failure reason", () => {
        const variables: ReadonlyArray<VariableContext> = [
            {
                Name: "Email", Source: "DataSource:CustomersV2",
                RowIndex: 3, Column: "Email",
                ResolvedValue: "alice@example.com", ValueType: "string",
                FailureReason: "Resolved", FailureDetail: null,
            },
            {
                Name: "OrderId", Source: "Row",
                RowIndex: 3, Column: "OrderId",
                ResolvedValue: null, ValueType: "null",
                FailureReason: "MissingColumn",
                FailureDetail: "Column 'OrderId' not present in row.",
            },
        ];
        render(<FailureDetailsPanel report={makeReport({ Variables: variables })} />);

        const rows = screen.getAllByTestId("failure-variable-row");
        expect(rows).toHaveLength(2);

        // Resolved variable
        expect(rows[0].dataset.resolved).toBe("true");
        expect(rows[0].textContent).toContain("{{Email}}");
        expect(rows[0].textContent).toContain("alice@example.com");
        expect(rows[0].textContent).toContain("DataSource:CustomersV2");

        // Failed variable
        expect(rows[1].dataset.resolved).toBe("false");
        expect(rows[1].textContent).toContain("{{OrderId}}");
        expect(rows[1].textContent).toContain("MissingColumn");
        expect(rows[1].textContent).toContain("Column 'OrderId' not present");

        // Variable failure outranks selector failure → top-level Reason flips
        const banner = screen.getByTestId("failure-reason-banner");
        expect(banner.dataset.group).toBe("variable");
        expect(banner.dataset.reason).toBe("VariableMissing");
    });

    it("renders source footer with file, StepId, StepKind, and timestamp", () => {
        render(<FailureDetailsPanel report={makeReport({})} />);
        const footer = screen.getByTestId("failure-source-footer");
        expect(footer.textContent).toContain("src/background/recorder/live-dom-replay.ts");
        expect(footer.textContent).toContain("StepId=7");
        expect(footer.textContent).toContain("Kind=Click");
        expect(footer.textContent).toContain("2026-04-26T10:00:00.000Z");
    });

    it("hides outer Card chrome when embedded prop is true", () => {
        const { container } = render(<FailureDetailsPanel report={makeReport({})} embedded />);
        const panel = within(container).getByTestId("failure-details-panel");
        expect(panel.tagName.toLowerCase()).toBe("section");
        expect(panel.getAttribute("aria-label")).toBe("Failure details");
    });

    it("collapses cleanly when there are no attempts and no variables", () => {
        render(<FailureDetailsPanel report={makeReport({})} />);
        expect(screen.queryByTestId("failure-selector-attempts")).toBeNull();
        expect(screen.queryByTestId("failure-variables")).toBeNull();
        // Banner still rendered (NoSelectors classification)
        expect(screen.getByTestId("failure-reason-banner")).toBeTruthy();
    });
});
