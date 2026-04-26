/**
 * Marco Extension — Recorder Data Source Parsers
 *
 * Phase 07 — Macro Recorder.
 *
 * Pure, dependency-free parsers that turn raw CSV / JSON payloads into a
 * `ParsedDataSource` shape ready to persist into the per-project SQLite
 * `DataSource` table. No DOM, no chrome, no async — fully unit-testable.
 *
 * CSV rules (deliberately minimal — RFC 4180 subset):
 *   - First non-empty line is the header row
 *   - Comma separator only
 *   - Double-quote field wrapping with `""` escape
 *   - CRLF or LF line endings
 *
 * JSON rules:
 *   - Must parse to a non-empty array of plain objects
 *   - Columns = union of keys across all rows, preserving first-seen order
 */

import { DataSourceKindId } from "../recorder-db-schema";

export interface ParsedDataSource {
    readonly DataSourceKindId: number;
    readonly Columns: ReadonlyArray<string>;
    readonly RowCount: number;
    /** Optional row payload — populated by Js / Endpoint kinds. */
    readonly Rows?: ReadonlyArray<Record<string, string>>;
}

/** Extended kind ids used by spec 17 §2.2. Mirrors planned migration 003. */
export const ExtendedDataSourceKindId = {
    Csv: 1,
    Json: 2,
    Js: 3,
    Endpoint: 4,
} as const;

/* ------------------------------------------------------------------ */
/*  CSV                                                                */
/* ------------------------------------------------------------------ */

export function parseCsv(text: string): ParsedDataSource {
    const lines = splitNonEmptyLines(text);
    const noLines = lines.length === 0;

    if (noLines) {
        throw new Error("CSV is empty — no header row found");
    }

    const headerLine = lines[0]!;
    const columns = parseCsvLine(headerLine);
    const rowCount = lines.length - 1;

    return {
        DataSourceKindId: DataSourceKindId.Csv,
        Columns: columns,
        RowCount: rowCount,
    };
}

function splitNonEmptyLines(text: string): string[] {
    return text
        .replace(/\r\n/g, "\n")
        .split("\n")
        .filter((line) => line.trim() !== "");
}

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        const next = line[i + 1];

        if (inQuotes) {
            const isEscapedQuote = ch === '"' && next === '"';
            if (isEscapedQuote) { current += '"'; i++; continue; }
            if (ch === '"') { inQuotes = false; continue; }
            current += ch;
            continue;
        }

        if (ch === '"') { inQuotes = true; continue; }
        if (ch === ",") { out.push(current.trim()); current = ""; continue; }
        current += ch;
    }

    out.push(current.trim());
    return out;
}

/* ------------------------------------------------------------------ */
/*  JSON                                                               */
/* ------------------------------------------------------------------ */

export function parseJsonRows(text: string): ParsedDataSource {
    const parsed = JSON.parse(text) as unknown;
    const isArray = Array.isArray(parsed);

    if (isArray === false) {
        throw new Error("JSON data source must be an array of objects");
    }

    const rows = parsed as ReadonlyArray<unknown>;
    const isEmpty = rows.length === 0;

    if (isEmpty) {
        throw new Error("JSON array is empty — at least one row required");
    }

    const columns = collectJsonColumns(rows);

    return {
        DataSourceKindId: DataSourceKindId.Json,
        Columns: columns,
        RowCount: rows.length,
    };
}

function collectJsonColumns(rows: ReadonlyArray<unknown>): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const row of rows) {
        const isPlainObject =
            row !== null && typeof row === "object" && Array.isArray(row) === false;

        if (isPlainObject === false) {
            throw new Error("JSON rows must be plain objects");
        }

        for (const key of Object.keys(row as Record<string, unknown>)) {
            if (seen.has(key) === false) {
                seen.add(key);
                ordered.push(key);
            }
        }
    }

    return ordered;
}
