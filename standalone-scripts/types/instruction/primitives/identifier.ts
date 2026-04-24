/**
 * Stable string identifier — typically `kebab-case`. Used for
 * `ProjectInstruction.name`, `SeedBlock.id`, dependency project IDs, etc.
 *
 * Branded so it cannot be confused with a display name or arbitrary text.
 */
export type Identifier = string & { readonly __brand: "Identifier" };
