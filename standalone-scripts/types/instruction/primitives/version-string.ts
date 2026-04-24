/**
 * Semantic version as it appears in `package.json` and `instruction.json`.
 *
 * Branded so a free-form string cannot be assigned by mistake. Construct
 * via the explicit `asVersionString()` helper (lives next to consumers).
 */
export type VersionString = string & { readonly __brand: "VersionString" };
