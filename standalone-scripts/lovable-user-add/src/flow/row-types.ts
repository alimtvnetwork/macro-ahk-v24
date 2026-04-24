/**
 * User Add — per-row state machine types.
 *
 * `RowExecutionContext` bundles everything a single row needs: the
 * parsed CSV row (WorkspaceUrl + MemberEmail + RoleCode), the shared
 * API client, and the XPath overrides (used only by task-level
 * sign-out, not per row).
 *
 * **Login model deviation from spec line P17**: User Add has no
 * per-row login (CSV has no LoginEmail/Password — operator is
 * task-logged-in once via the popup). Sign-out is therefore
 * task-level (runs once after all rows), NOT per-row. Spec
 * literal "sign-out always runs" is reinterpreted as "task-end
 * sign-out always runs". Flag for P20 audit + user confirmation.
 *
 * Q3 carryover: `Row.WasEditorNormalized` surfaces in the per-row
 * log entry so the audit trail shows Editor→Member coercion.
 */

import type { LovableApiClient } from "../../../lovable-common/src/api/lovable-api-client";
import type { UserAddCsvRow } from "../csv";
import type { XPathSettingSeed } from "../migrations/xpath-setting-seed";

export interface UserAddTaskParams {
    TaskId: string;
    DefaultRoleCode: string;
}

export interface UserAddRowContext {
    Task: UserAddTaskParams;
    Row: UserAddCsvRow;
    Api: LovableApiClient;
    XPathOverrides: ReadonlyArray<XPathSettingSeed>;
}

export enum UserAddRowOutcomeCode {
    Succeeded = "Succeeded",
    StepAFailed = "StepAFailed",
    StepBFailed = "StepBFailed",
}

export interface UserAddRowResult {
    RowIndex: number;
    Outcome: UserAddRowOutcomeCode;
    IsDone: boolean;
    HasError: boolean;
    LastError: string | null;
    DurationMs: number;
    StepBRan: boolean;
}
