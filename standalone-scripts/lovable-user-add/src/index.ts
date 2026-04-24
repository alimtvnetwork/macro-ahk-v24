/**
 * Lovable User Add — public barrel.
 *
 * P11: entry class + instruction manifest.
 * P12: migration v1 (DDL + MembershipRole + TaskStatus seeds).
 * P13: CSV parser + validator (Editor→Member normalization).
 * P14: popup UI shell + default-role select.
 * P15: Step A — POST membership.
 * P16: Step B — Owner promotion via shared `promoteToOwner` (R12).
 * P17: per-row state machine + sign-out.
 */

export { LovableUserAdd } from "./lovable-user-add";
export { default as instruction } from "./instruction";
export { USER_ADD_MIGRATION_V1 } from "./migrations";
export { UserAddMembershipRoleCode } from "./migrations/membership-role-seed";
export { UserAddTaskStatusCode } from "./migrations/task-status-seed";
