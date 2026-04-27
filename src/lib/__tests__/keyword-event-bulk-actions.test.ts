import { describe, expect, it } from "vitest";

import {
    buildExportPayload,
    collectCategories,
    computeSequencePreview,
    formatSequenceNumber,
    mergeTags,
    normaliseCategory,
    parseTagInput,
    removeTags,
    renderSequenceName,
} from "../keyword-event-bulk-actions";

describe("formatSequenceNumber", () => {
    it("zero-pads to the requested width", () => {
        expect(formatSequenceNumber(1, 2)).toBe("01");
        expect(formatSequenceNumber(42, 4)).toBe("0042");
    });
    it("clamps padding to [1, 6]", () => {
        expect(formatSequenceNumber(1, 0)).toBe("1");
        expect(formatSequenceNumber(1, 99)).toBe("000001");
    });
});

describe("renderSequenceName", () => {
    it("substitutes {n} when present", () => {
        const out = renderSequenceName({ Base: "Login {n}", Start: 1, Padding: 2, Separator: " " }, 0);
        expect(out).toBe("Login 01");
    });
    it("appends with separator when {n} absent", () => {
        const out = renderSequenceName({ Base: "Login", Start: 5, Padding: 1, Separator: " - " }, 2);
        expect(out).toBe("Login - 7");
    });
    it("falls back to bare number when base is empty", () => {
        expect(renderSequenceName({ Base: "  ", Start: 1, Padding: 2, Separator: " " }, 0)).toBe("01");
    });
});

describe("mergeTags / removeTags", () => {
    it("merges, trims, dedupes case-insensitively, sorts", () => {
        expect(mergeTags(["alpha"], [" Beta ", "ALPHA", "gamma"])).toEqual(["alpha", "Beta", "gamma"]);
    });
    it("treats undefined current as empty", () => {
        expect(mergeTags(undefined, ["a", "b"])).toEqual(["a", "b"]);
    });
    it("removeTags drops case-insensitively", () => {
        expect(removeTags(["alpha", "Beta", "gamma"], ["ALPHA"])).toEqual(["Beta", "gamma"]);
    });
});

describe("parseTagInput", () => {
    it("splits on commas, whitespace, and newlines", () => {
        expect(parseTagInput("foo, bar  baz\nqux,,")).toEqual(["foo", "bar", "baz", "qux"]);
    });
});

describe("buildExportPayload", () => {
    it("wraps events with format + timestamp", () => {
        const ev = { Id: "a", Keyword: "k", Description: "", Steps: [], Enabled: true } as never;
        const payload = buildExportPayload([ev]);
        expect(payload.Format).toBe("marco.keyword-events.v1");
        expect(payload.Events).toHaveLength(1);
        expect(typeof payload.ExportedAt).toBe("string");
    });
});

describe("normaliseCategory", () => {
    it("trims and collapses whitespace", () => {
        expect(normaliseCategory("  Auth   smoke  ")).toBe("Auth smoke");
    });
    it("returns undefined for empty / whitespace-only / undefined", () => {
        expect(normaliseCategory("")).toBeUndefined();
        expect(normaliseCategory("   \t\n ")).toBeUndefined();
        expect(normaliseCategory(undefined)).toBeUndefined();
    });
    it("preserves case", () => {
        expect(normaliseCategory("Login Flow")).toBe("Login Flow");
    });
});

describe("collectCategories", () => {
    it("returns unique non-empty categories sorted case-insensitively", () => {
        const out = collectCategories([
            { Category: "Auth" },
            { Category: "  smoke  " },
            { Category: "auth" },
            { Category: "" },
            { Category: undefined },
            { Category: "Regression" },
        ]);
        expect(out).toEqual(["Auth", "Regression", "smoke"]);
    });
    it("returns [] when no events have a category", () => {
        expect(collectCategories([{}, { Category: undefined }, { Category: "" }])).toEqual([]);
    });
});
