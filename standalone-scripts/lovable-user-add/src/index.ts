/**
 * Lovable User Add — public barrel.
 *
 * P11: entry class + instruction manifest.
 * P12: migration v1 (DDL + MembershipRole seed).
 * P13: CSV parser + validator (Editor→Member normalization).
 * P14: popup UI shell + default-role select.
 * P15: Step A — POST membership.
 * P16: Step B — Owner promotion via shared `promoteToOwner` (R12).
 * P17: per-row state machine + sign-out.
 */

export { LovableUserAdd } from "./lovable-user-add";
export { default as instruction } from "./instruction";
