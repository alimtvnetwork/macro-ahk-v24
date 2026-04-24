/**
 * Lovable Owner Switch — public barrel.
 *
 * P4: entry class + instruction manifest.
 * P5: migration v1 (DDL + TaskStatus + XPathSetting seeds).
 * Future phases append CSV parser, UI mount, and flow steps.
 */

export { LovableOwnerSwitch } from "./lovable-owner-switch";
export { default as instruction } from "./instruction";
export { OWNER_SWITCH_MIGRATION_V1 } from "./migrations";
export { OwnerSwitchTaskStatusCode } from "./migrations/task-status-seed";
