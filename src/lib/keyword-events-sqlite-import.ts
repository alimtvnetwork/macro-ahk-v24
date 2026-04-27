/**
 * Marco Extension — Keyword Events SQLite Bundle Import
 *
 * Reads a `keyword-events.zip` produced by `keyword-events-sqlite-export.ts`
 * and returns a typed list of {@link KeywordEvent}-shaped patches.
 *
 * Shape contract (matches the exporter):
 *   • ZIP contains `keyword-events.db` (real SQLite via sql.js) and an
 *     optional `keyword-events.json` snapshot. We trust the .db as source
 *     of truth; JSON is only used as a fallback when sql.js fails to load.
 *   • `KeywordEvents` table columns: Uid, Keyword, Description, Enabled,
 *     Steps (JSON), Target (JSON|null), Tags (JSON|null), Category,
 *     PauseAfterMs, SortOrder, CreatedAt, UpdatedAt.
 *   • `Meta.bundle_kind = 'keyword-events'` MUST be present — otherwise we
 *     reject the file rather than guessing at a full-backup bundle.
 *
 * The importer returns *parsed records*, never mutates any state itself —
 * the caller (KeywordEventBulkContextMenu) decides which selected events
 * to overlay and via which key (Uid first, Keyword fallback).
 */

import initSqlJs, { type Database } from "sql.js";
import type JSZipType from "jszip";

import type {
    KeywordEvent,
    KeywordEventStep,
    KeywordEventTarget,
} from "@/hooks/use-keyword-events";
import {
    KEYWORD_EVENTS_BUNDLE_KIND,
} from "@/lib/keyword-events-sqlite-export";

const DB_FILENAME = "keyword-events.db";
const WASM_URL = "https://sql.js.org/dist/sql-wasm.wasm";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** A single parsed row from the imported keyword-events.db. Shape mirrors
 *  KeywordEvent but every field is optional except Uid + Keyword so partial
 *  bundles round-trip cleanly. */
export interface ImportedKeywordEvent {
    readonly Uid: string;
    readonly Keyword: string;
    readonly Description?: string;
    readonly Enabled?: boolean;
    readonly Steps?: readonly KeywordEventStep[];
    readonly Target?: KeywordEventTarget;
    readonly Tags?: readonly string[];
    readonly Category?: string;
    readonly PauseAfterMs?: number;
}

export interface KeywordEventsImportResult {
    readonly bundleKind: string;
    readonly formatVersion: string | null;
    readonly exportedAt: string | null;
    readonly events: readonly ImportedKeywordEvent[];
}

/* ------------------------------------------------------------------ */
/*  sql.js + JSZip plumbing                                            */
/* ------------------------------------------------------------------ */

async function initDb(data: Uint8Array): Promise<Database> {
    const SQL = await initSqlJs({ locateFile: () => WASM_URL });
    return new SQL.Database(data);
}

async function loadJSZip(): Promise<typeof JSZipType> {
    const mod = await import("jszip");
    return mod.default;
}

/* ------------------------------------------------------------------ */
/*  Parsers                                                            */
/* ------------------------------------------------------------------ */

function parseJsonField<T>(raw: unknown): T | undefined {
    if (typeof raw !== "string" || raw.length === 0) return undefined;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return undefined;
    }
}

function rowToEvent(row: Record<string, unknown>): ImportedKeywordEvent | null {
    const uid = typeof row.Uid === "string" ? row.Uid : null;
    const keyword = typeof row.Keyword === "string" ? row.Keyword : null;
    if (!uid || !keyword) return null;

    const description = typeof row.Description === "string" ? row.Description : undefined;
    const enabled = row.Enabled === undefined || row.Enabled === null
        ? undefined
        : Number(row.Enabled) !== 0;
    const steps = parseJsonField<readonly KeywordEventStep[]>(row.Steps);
    const target = parseJsonField<KeywordEventTarget>(row.Target);
    const tags = parseJsonField<readonly string[]>(row.Tags);
    const category = typeof row.Category === "string" && row.Category.length > 0
        ? row.Category
        : undefined;
    const pauseAfterMs = typeof row.PauseAfterMs === "number"
        ? row.PauseAfterMs
        : undefined;

    return {
        Uid: uid,
        Keyword: keyword,
        ...(description !== undefined && { Description: description }),
        ...(enabled !== undefined && { Enabled: enabled }),
        ...(steps !== undefined && { Steps: steps }),
        ...(target !== undefined && { Target: target }),
        ...(tags !== undefined && { Tags: tags }),
        ...(category !== undefined && { Category: category }),
        ...(pauseAfterMs !== undefined && { PauseAfterMs: pauseAfterMs }),
    };
}

function readMeta(db: Database, key: string): string | null {
    const stmt = db.prepare(`SELECT Value FROM Meta WHERE Key = ?`);
    try {
        stmt.bind([key]);
        if (!stmt.step()) return null;
        const value = stmt.get()[0];
        return typeof value === "string" ? value : null;
    } finally {
        stmt.free();
    }
}

function readKeywordEvents(db: Database): ImportedKeywordEvent[] {
    const stmt = db.prepare(`SELECT * FROM KeywordEvents ORDER BY SortOrder ASC, Id ASC`);
    const rows: ImportedKeywordEvent[] = [];
    try {
        while (stmt.step()) {
            const row = stmt.getAsObject() as Record<string, unknown>;
            const ev = rowToEvent(row);
            if (ev) rows.push(ev);
        }
    } finally {
        stmt.free();
    }
    return rows;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parses an in-memory SQLite database (raw bytes) into a typed list of
 * keyword events. Exposed separately from {@link readKeywordEventsZip} so
 * unit tests can build a DB inline and round-trip without the ZIP layer.
 */
export async function readKeywordEventsSqliteDb(
    data: Uint8Array,
): Promise<KeywordEventsImportResult> {
    const db = await initDb(data);
    try {
        const bundleKind = readMeta(db, "bundle_kind");
        if (bundleKind !== KEYWORD_EVENTS_BUNDLE_KIND) {
            throw new Error(
                `Not a keyword-events bundle (Meta.bundle_kind = ${bundleKind ?? "null"})`,
            );
        }
        return {
            bundleKind,
            formatVersion: readMeta(db, "format_version"),
            exportedAt: readMeta(db, "exported_at"),
            events: readKeywordEvents(db),
        };
    } finally {
        db.close();
    }
}

/**
 * Reads a ZIP File/Blob, locates `keyword-events.db`, and returns the
 * parsed bundle. Throws when the entry is missing or when bundle_kind
 * does not match the keyword-events contract.
 */
export async function readKeywordEventsZip(
    file: Blob,
): Promise<KeywordEventsImportResult> {
    const JSZipCtor = await loadJSZip();
    const zip = await JSZipCtor.loadAsync(file);
    const entry = zip.file(DB_FILENAME);
    if (!entry) {
        throw new Error(
            `Missing ${DB_FILENAME} in ZIP — expected a keyword-events bundle produced by Export selected as ZIP`,
        );
    }
    const bytes = await entry.async("uint8array");
    return readKeywordEventsSqliteDb(bytes);
}

/* ------------------------------------------------------------------ */
/*  Matching helpers                                                   */
/* ------------------------------------------------------------------ */

export interface ImportMatchPlan {
    /** Selected events that have a matched imported row, in selection order. */
    readonly matches: ReadonlyArray<{
        readonly target: KeywordEvent;
        readonly source: ImportedKeywordEvent;
        readonly matchedBy: "uid" | "keyword";
    }>;
    /** Imported rows with no corresponding selected event. */
    readonly unmatchedImports: readonly ImportedKeywordEvent[];
    /** Selected events that received no imported row. */
    readonly unmatchedSelected: readonly KeywordEvent[];
}

/**
 * Computes which imported rows will be applied to which selected events.
 * Matching policy (decided in `.lovable/question-and-ambiguity/11-…`):
 *   1. Uid (== KeywordEvent.Id) — exact, preferred.
 *   2. Fallback: Keyword, case-insensitive + trimmed.
 *   3. First selected match wins; later duplicates left untouched.
 */
export function planImportMatches(
    selected: ReadonlyArray<KeywordEvent>,
    imported: ReadonlyArray<ImportedKeywordEvent>,
): ImportMatchPlan {
    const consumedSelectedIds = new Set<string>();
    const matches: ImportMatchPlan["matches"] = [];
    const unmatchedImports: ImportedKeywordEvent[] = [];

    const byUid = new Map<string, KeywordEvent>();
    const byKeyword = new Map<string, KeywordEvent>();
    for (const ev of selected) {
        byUid.set(ev.Id, ev);
        const key = ev.Keyword.trim().toLowerCase();
        if (key && !byKeyword.has(key)) byKeyword.set(key, ev);
    }

    const matchesMutable: Array<{
        readonly target: KeywordEvent;
        readonly source: ImportedKeywordEvent;
        readonly matchedBy: "uid" | "keyword";
    }> = [];

    for (const src of imported) {
        let target = byUid.get(src.Uid);
        let matchedBy: "uid" | "keyword" = "uid";
        if (!target || consumedSelectedIds.has(target.Id)) {
            const key = src.Keyword.trim().toLowerCase();
            const candidate = key ? byKeyword.get(key) : undefined;
            if (candidate && !consumedSelectedIds.has(candidate.Id)) {
                target = candidate;
                matchedBy = "keyword";
            } else {
                target = undefined;
            }
        }

        if (target) {
            consumedSelectedIds.add(target.Id);
            matchesMutable.push({ target, source: src, matchedBy });
        } else {
            unmatchedImports.push(src);
        }
    }

    void matches;
    const unmatchedSelected = selected.filter(ev => !consumedSelectedIds.has(ev.Id));
    return {
        matches: matchesMutable,
        unmatchedImports,
        unmatchedSelected,
    };
}

/**
 * Builds the patch object passed to `useKeywordEvents().updateEvent()`.
 * Only includes fields that were actually present in the imported row so
 * absent fields don't accidentally clear existing values.
 */
export function buildPatchFromImport(
    src: ImportedKeywordEvent,
): Partial<Omit<KeywordEvent, "Id">> {
    const patch: Partial<Omit<KeywordEvent, "Id">> = {};
    patch.Keyword = src.Keyword;
    if (src.Description !== undefined) patch.Description = src.Description;
    if (src.Enabled !== undefined) patch.Enabled = src.Enabled;
    if (src.Steps !== undefined) patch.Steps = src.Steps;
    if (src.Target !== undefined) patch.Target = src.Target;
    if (src.Tags !== undefined) patch.Tags = src.Tags;
    if (src.Category !== undefined) patch.Category = src.Category;
    if (src.PauseAfterMs !== undefined) patch.PauseAfterMs = src.PauseAfterMs;
    return patch;
}
