/**
 * Owner Switch — top-level CSV parser.
 *
 * Pipeline: splitCsv → resolveHeader → per-row extract → validateRow.
 * Returns a `OwnerSwitchCsvParseResult` with rows + errors + warnings;
 * never throws. UI consumes this to populate the row table and block
 * task creation when `Errors.length > 0`.
 */

import { OwnerSwitchCsvColumn } from "./csv-column";
import { splitCsv } from "./csv-splitter";
import { resolveHeader } from "./csv-header";
import { readOptional, readRequired } from "./csv-cell";
import { validateRow } from "./csv-validator";
import type { OwnerSwitchCsvRow, OwnerSwitchCsvParseResult, CsvParseError } from "./csv-types";

const buildRow = (
    raw: ReadonlyArray<string>,
    indices: ReadonlyMap<OwnerSwitchCsvColumn, number>,
    rowIndex: number,
): OwnerSwitchCsvRow => ({
    RowIndex: rowIndex,
    LoginEmail: readRequired(raw, indices, OwnerSwitchCsvColumn.LoginEmail),
    Password: readOptional(raw, indices, OwnerSwitchCsvColumn.Password),
    OwnerEmail1: readRequired(raw, indices, OwnerSwitchCsvColumn.OwnerEmail1),
    OwnerEmail2: readOptional(raw, indices, OwnerSwitchCsvColumn.OwnerEmail2),
    Notes: readOptional(raw, indices, OwnerSwitchCsvColumn.Notes),
});

const tryBuildRow = (
    raw: ReadonlyArray<string>,
    indices: ReadonlyMap<OwnerSwitchCsvColumn, number>,
    rowIndex: number,
    errors: CsvParseError[],
): OwnerSwitchCsvRow | null => {
    try {
        return buildRow(raw, indices, rowIndex);
    } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : String(caught);
        errors.push({ RowIndex: rowIndex, Column: null, Message: message });

        return null;
    }
};

export const parseOwnerSwitchCsv = (text: string): OwnerSwitchCsvParseResult => {
    const grid = splitCsv(text);

    if (grid.length === 0) {
        return { Rows: [], Errors: [{ RowIndex: 0, Column: null, Message: "CSV is empty" }], Warnings: [] };
    }

    const header = resolveHeader(grid[0]);
    const errors: CsvParseError[] = [...header.Errors];
    const rows: OwnerSwitchCsvRow[] = [];

    for (let i = 1; i < grid.length; i += 1) {
        const row = tryBuildRow(grid[i], header.Indices, i, errors);

        if (row !== null) {
            rows.push(row);
            errors.push(...validateRow(row));
        }
    }

    return { Rows: rows, Errors: errors, Warnings: header.Warnings };
};
