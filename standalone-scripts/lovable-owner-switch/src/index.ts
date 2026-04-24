/**
 * Lovable Owner Switch — public barrel.
 *
 * P4: re-exports the entry class and instruction manifest only.
 * Future phases append exports for migrations, CSV parser, UI mount,
 * and flow steps without breaking the public surface.
 */

export { LovableOwnerSwitch } from "./lovable-owner-switch";
export { default as instruction } from "./instruction";
