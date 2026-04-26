/**
 * Marco Extension — XPath Capture → StepDraft Bridge
 *
 * Phase 06↔09 wiring: converts a content-script `XPATH_CAPTURED` payload
 * into a `StepDraft` accepted by `step-persistence.insertStep`.
 *
 * Contract:
 *   - Always emits a primary `XPathFull` selector (SelectorKindId=1).
 *   - When the capture produced a relative XPath, emits a second
 *     `XPathRelative` selector (SelectorKindId=2) carrying the persisted
 *     anchor's SelectorId in `AnchorSelectorId`. This second row is NOT
 *     primary — the full XPath remains the deterministic primary pick.
 *   - The anchor must already exist in the DB; the caller resolves it (via
 *     `findAnchorSelectorId`) before invoking the bridge.
 *
 * @see spec/31-macro-recorder/06-xpath-capture-engine.md   — capture payload
 * @see spec/31-macro-recorder/09-step-persistence-and-replay.md — Step rows
 * @see spec/31-macro-recorder/13-capture-to-step-bridge.md  — this bridge
 */

import type { Database as SqlJsDatabase } from "sql.js";
import {
    SelectorKindId,
    StepKindId,
} from "../recorder-db-schema";
import type {
    SelectorDraft,
    StepDraft,
} from "./step-persistence";

/** Subset of the Phase 06 `XPATH_CAPTURED` payload the bridge consumes. */
export interface XPathCapturePayload {
    readonly XPathFull: string;
    readonly XPathRelative: string | null;
    readonly AnchorXPath: string | null;
    readonly SuggestedVariableName: string;
    readonly TagName: string;
    readonly Text: string;
}

/* ------------------------------------------------------------------ */
/*  StepKind inference                                                 */
/* ------------------------------------------------------------------ */

const TYPE_TAGS = new Set(["input", "textarea"]);
const SELECT_TAGS = new Set(["select"]);

/** Infers a StepKind from the captured tag name. Defaults to Click. */
export function inferStepKind(
    tagName: string,
): (typeof StepKindId)[keyof typeof StepKindId] {
    const lower = tagName.toLowerCase();
    if (SELECT_TAGS.has(lower)) return StepKindId.Select;
    if (TYPE_TAGS.has(lower)) return StepKindId.Type;
    return StepKindId.Click;
}

/* ------------------------------------------------------------------ */
/*  Anchor resolver                                                    */
/* ------------------------------------------------------------------ */

/**
 * Looks up an existing primary `XPathFull` Selector row whose Expression
 * matches `anchorXPath`. Returns the SelectorId or null when no anchor row
 * exists yet (happens on the very first capture).
 *
 * Pure DB-layer — accepts a `SqlJsDatabase` so it is unit-testable.
 */
export function findAnchorSelectorId(
    db: SqlJsDatabase,
    anchorXPath: string,
): number | null {
    const result = db.exec(
        `SELECT SelectorId
         FROM Selector
         WHERE SelectorKindId = ?
           AND Expression = ?
           AND IsPrimary = 1
         ORDER BY SelectorId DESC
         LIMIT 1`,
        [SelectorKindId.XPathFull, anchorXPath],
    );
    const row = result[0]?.values[0];
    if (row === undefined) return null;
    return row[0] as number;
}

/* ------------------------------------------------------------------ */
/*  Label + variable-name normalisers                                  */
/* ------------------------------------------------------------------ */

/** Builds a human-readable Label from the capture, capped at 80 chars. */
export function buildLabel(payload: XPathCapturePayload): string {
    const trimmed = payload.Text.trim();
    const tag = payload.TagName.toLowerCase();
    if (trimmed.length === 0) return `<${tag}>`;
    const head = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
    return `<${tag}> ${head}`;
}

/* ------------------------------------------------------------------ */
/*  Public bridge                                                      */
/* ------------------------------------------------------------------ */

/**
 * Builds a `StepDraft` from a capture payload.
 *
 * `anchorSelectorId` MUST be supplied when `payload.XPathRelative` is
 * non-null and the caller has located a matching anchor row. When the
 * caller cannot resolve an anchor (no prior captures for that ancestor)
 * the relative selector is dropped silently — the full XPath still works
 * deterministically.
 */
export function buildStepDraftFromCapture(
    payload: XPathCapturePayload,
    anchorSelectorId: number | null,
): StepDraft {
    if (!payload.XPathFull || payload.XPathFull.length === 0) {
        throw new Error("Capture payload missing XPathFull");
    }
    if (!payload.SuggestedVariableName) {
        throw new Error("Capture payload missing SuggestedVariableName");
    }

    const selectors: SelectorDraft[] = [
        {
            SelectorKindId: SelectorKindId.XPathFull,
            Expression: payload.XPathFull,
            AnchorSelectorId: null,
            IsPrimary: true,
        },
    ];

    if (payload.XPathRelative !== null && anchorSelectorId !== null) {
        selectors.push({
            SelectorKindId: SelectorKindId.XPathRelative,
            Expression: payload.XPathRelative,
            AnchorSelectorId: anchorSelectorId,
            IsPrimary: false,
        });
    }

    return {
        StepKindId: inferStepKind(payload.TagName),
        VariableName: payload.SuggestedVariableName,
        Label: buildLabel(payload),
        InlineJs: null,
        IsBreakpoint: false,
        Selectors: selectors,
    };
}
