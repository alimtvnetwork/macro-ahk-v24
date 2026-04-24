/**
 * User Add — row-result builders.
 *
 * Pure factories extracted from `run-row.ts` to keep that file under
 * the 100-line cap. Both functions stamp `DurationMs` from the row
 * start time so the orchestrator just passes `startedAt` through.
 */

import { UserAddRowOutcomeCode } from "./row-types";
import type { UserAddRowResult } from "./row-types";

export const buildRowFailure = (
    rowIndex: number, startedAt: number, outcome: UserAddRowOutcomeCode,
    error: string, stepBRan: boolean,
): UserAddRowResult => ({
    RowIndex: rowIndex, Outcome: outcome, IsDone: false, HasError: true,
    LastError: error, DurationMs: Date.now() - startedAt, StepBRan: stepBRan,
});

export const buildRowSuccess = (
    rowIndex: number, startedAt: number, stepBRan: boolean,
): UserAddRowResult => ({
    RowIndex: rowIndex, Outcome: UserAddRowOutcomeCode.Succeeded,
    IsDone: true, HasError: false, LastError: null,
    DurationMs: Date.now() - startedAt, StepBRan: stepBRan,
});
