/**
 * Failure-bundle exporter unit tests (Phase 09 follow-up).
 */

import { describe, it, expect } from "vitest";
import {
    buildFailureBundle,
    serializeFailureBundle,
    buildFailureBundleFilename,
} from "../failure-export";
import { buildFailureReport, type FailureReport } from "@/background/recorder/failure-logger";

const FIXED_NOW = (): Date => new Date("2026-04-26T10:30:00.000Z");

function sampleReport(message: string, stepId: number): FailureReport {
    return buildFailureReport({
        Phase: "Replay",
        Error: new Error(message),
        StepId: stepId,
        Index: stepId - 1,
        StepKind: "Click",
        SourceFile: "src/test.ts",
        Now: FIXED_NOW,
    });
}

describe("buildFailureBundle", () => {
    it("wraps reports with metadata", () => {
        const bundle = buildFailureBundle([sampleReport("a", 1), sampleReport("b", 2)], {
            Now: FIXED_NOW,
        });
        expect(bundle.Generator).toBe("marco-extension");
        expect(bundle.Version).toBe(1);
        expect(bundle.Count).toBe(2);
        expect(bundle.ExportedAt).toBe("2026-04-26T10:30:00.000Z");
        expect(bundle.Reports).toHaveLength(2);
    });

    it("preserves selected reports verbatim and tolerates an empty selection", () => {
        const empty = buildFailureBundle([], { Now: FIXED_NOW });
        expect(empty.Count).toBe(0);
        expect(empty.Reports).toEqual([]);

        const r = sampleReport("kept", 7);
        const single = buildFailureBundle([r], { Now: FIXED_NOW });
        expect(single.Reports[0]).toBe(r);
    });
});

describe("serializeFailureBundle", () => {
    it("returns parseable, pretty-printed JSON", () => {
        const bundle = buildFailureBundle([sampleReport("x", 3)], { Now: FIXED_NOW });
        const text = serializeFailureBundle(bundle);
        expect(text).toContain("\n  "); // pretty-printed
        const parsed = JSON.parse(text);
        expect(parsed.Generator).toBe("marco-extension");
        expect(parsed.Reports).toHaveLength(1);
        expect(parsed.Reports[0].Message).toContain("x");
    });
});

describe("buildFailureBundleFilename", () => {
    it("formats as marco-failure-reports-YYYY-MM-DD-HHmm.json", () => {
        const name = buildFailureBundleFilename(new Date("2026-04-26T10:30:00.000Z"));
        expect(name).toBe("marco-failure-reports-2026-04-26-1030.json");
    });
});
