/**
 * Lovable Owner Switch — public barrel.
 *
 * P4: entry class + instruction manifest.
 * P5: migration v1 (DDL + TaskStatus + XPathSetting seeds).
 * P6: CSV parser + validator (`parseOwnerSwitchCsv`).
 * Future phases append UI mount and flow steps.
 */

export { LovableOwnerSwitch } from "./lovable-owner-switch";
export { default as instruction } from "./instruction";
export { OWNER_SWITCH_MIGRATION_V1 } from "./migrations";
export { OwnerSwitchTaskStatusCode } from "./migrations/task-status-seed";
export { parseOwnerSwitchCsv, OwnerSwitchCsvColumn } from "./csv";
export type { OwnerSwitchCsvRow, OwnerSwitchCsvParseResult } from "./csv";
