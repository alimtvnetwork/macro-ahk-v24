/**
 * Marco Extension — Step Chain Persistence (Phase 14)
 *
 * CRUD for the Phase 14 chain extensions: editable per-step metadata
 * (Description / IsDisabled / RetryCount / TimeoutMs), tag set, and the
 * two cross-project link slots (OnSuccessProjectId / OnFailureProjectId).
 *
 * Pure DB-layer helpers take a `SqlJsDatabase` so they are unit-testable
 * with an in-memory schema; async wrappers route through `initProjectDb`
 * for production use, mirroring the pattern in `step-persistence.ts`.
 *
 * @see spec/31-macro-recorder/14-step-chaining-and-cross-project-links.md
 */

import type { Database as SqlJsDatabase } from "sql.js";
import { initProjectDb } from "../project-db-manager";
import { readStepRow, type PersistedStep } from "./step-persistence";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface StepMetaPatch {
    readonly Label?: string;
    readonly Description?: string | null;
    readonly IsDisabled?: boolean;
    readonly RetryCount?: number;
    readonly TimeoutMs?: number | null;
}

export type StepLinkSlot = "OnSuccessProjectId" | "OnFailureProjectId";

/* ------------------------------------------------------------------ */
/*  Validation helpers (each < 8 lines)                                */
/* ------------------------------------------------------------------ */

function assertRetry(n: number): void {
    if (!Number.isInteger(n) || n < 0) throw new Error(`RetryCount must be a non-negative integer; got ${n}`);
}

function assertTimeout(n: number | null): void {
    if (n === null) return;
    if (!Number.isInteger(n) || n <= 0) throw new Error(`TimeoutMs must be a positive integer or null; got ${n}`);
}

function assertLabel(s: string): void {
    if (s.trim().length === 0) throw new Error("Label cannot be empty");
}

function assertTagName(s: string): void {
    const trimmed = s.trim();
    if (trimmed.length === 0) throw new Error("Tag name cannot be empty");
    if (trimmed.length > 64) throw new Error(`Tag name exceeds 64 chars: ${trimmed.length}`);
}

/* ------------------------------------------------------------------ */
/*  Pure DB-layer — meta patch                                         */
/* ------------------------------------------------------------------ */

export function updateStepMetaRow(
    db: SqlJsDatabase,
    stepId: number,
    patch: StepMetaPatch,
): PersistedStep {
    if (patch.Label !== undefined) assertLabel(patch.Label);
    if (patch.RetryCount !== undefined) assertRetry(patch.RetryCount);
    if (patch.TimeoutMs !== undefined) assertTimeout(patch.TimeoutMs);

    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    pushIfDefined(patch.Label, "Label", sets, params);
    pushIfDefined(patch.Description ?? undefined, "Description", sets, params);
    pushIfDefinedBool(patch.IsDisabled, "IsDisabled", sets, params);
    pushIfDefined(patch.RetryCount, "RetryCount", sets, params);
    pushIfDefined(patch.TimeoutMs ?? undefined, "TimeoutMs", sets, params);

    if (sets.length === 0) return readStepRow(db, stepId);
    sets.push("UpdatedAt = datetime('now')");
    params.push(stepId);
    db.run(`UPDATE Step SET ${sets.join(", ")} WHERE StepId = ?`, params);
    return readStepRow(db, stepId);
}

function pushIfDefined(
    value: string | number | null | undefined,
    column: string,
    sets: string[],
    params: Array<string | number | null>,
): void {
    if (value === undefined) return;
    sets.push(`${column} = ?`);
    params.push(value);
}

function pushIfDefinedBool(
    value: boolean | undefined,
    column: string,
    sets: string[],
    params: Array<string | number | null>,
): void {
    if (value === undefined) return;
    sets.push(`${column} = ?`);
    params.push(value ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/*  Pure DB-layer — tags                                               */
/* ------------------------------------------------------------------ */

export function setStepTagsRow(
    db: SqlJsDatabase,
    stepId: number,
    names: ReadonlyArray<string>,
): ReadonlyArray<string> {
    const unique = dedupeTags(names);
    db.run("DELETE FROM StepTag WHERE StepId = ?", [stepId]);
    for (const name of unique) {
        db.run("INSERT INTO StepTag (StepId, Name) VALUES (?, ?)", [stepId, name]);
    }
    return listStepTagsRow(db, stepId);
}

function dedupeTags(names: ReadonlyArray<string>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of names) {
        assertTagName(raw);
        const trimmed = raw.trim();
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}

export function listStepTagsRow(
    db: SqlJsDatabase,
    stepId: number,
): ReadonlyArray<string> {
    const result = db.exec(
        "SELECT Name FROM StepTag WHERE StepId = ? ORDER BY Name ASC",
        [stepId],
    );
    const values = result[0]?.values ?? [];
    return values.map((row) => row[0] as string);
}

/* ------------------------------------------------------------------ */
/*  Pure DB-layer — cross-project links                                */
/* ------------------------------------------------------------------ */

export function setStepLinkRow(
    db: SqlJsDatabase,
    stepId: number,
    slot: StepLinkSlot,
    projectSlug: string | null,
): PersistedStep {
    const value = normaliseProjectSlug(projectSlug);
    db.run(
        `UPDATE Step SET ${slot} = ?, UpdatedAt = datetime('now') WHERE StepId = ?`,
        [value, stepId],
    );
    return readStepRow(db, stepId);
}

function normaliseProjectSlug(raw: string | null): string | null {
    if (raw === null) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > 128) throw new Error(`Project slug exceeds 128 chars: ${trimmed.length}`);
    return trimmed;
}

/* ------------------------------------------------------------------ */
/*  Async facade — production wrappers                                 */
/* ------------------------------------------------------------------ */

export async function updateStepMeta(
    projectSlug: string,
    stepId: number,
    patch: StepMetaPatch,
): Promise<PersistedStep> {
    const mgr = await initProjectDb(projectSlug);
    const step = updateStepMetaRow(mgr.getDb(), stepId, patch);
    mgr.markDirty();
    return step;
}

export async function setStepTags(
    projectSlug: string,
    stepId: number,
    names: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
    const mgr = await initProjectDb(projectSlug);
    const tags = setStepTagsRow(mgr.getDb(), stepId, names);
    mgr.markDirty();
    return tags;
}

export async function listStepTags(
    projectSlug: string,
    stepId: number,
): Promise<ReadonlyArray<string>> {
    const mgr = await initProjectDb(projectSlug);
    return listStepTagsRow(mgr.getDb(), stepId);
}

export async function setStepLink(
    projectSlug: string,
    stepId: number,
    slot: StepLinkSlot,
    targetProjectSlug: string | null,
): Promise<PersistedStep> {
    const mgr = await initProjectDb(projectSlug);
    const step = setStepLinkRow(mgr.getDb(), stepId, slot, targetProjectSlug);
    mgr.markDirty();
    return step;
}
