/**
 * URL pattern string. Interpretation depends on the sibling `MatchType`
 * value on the owning `TargetUrl`.
 *
 * Branded so generic strings cannot be assigned without going through
 * `asUrlPattern()` (lives next to consumers).
 */
export type UrlPattern = string & { readonly __brand: "UrlPattern" };
