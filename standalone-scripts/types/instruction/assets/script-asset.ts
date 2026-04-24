/**
 * One JavaScript bundle file shipped with the script. The injection
 * scheduler honours `order` for stable load sequencing.
 *
 * - `configBinding` / `themeBinding` — name of a `ConfigAsset.key` whose
 *   parsed value should be passed to the IIFE on load (resolved by the
 *   loader, never by the script itself).
 * - `isImmediatelyInvokedFunction` — true when the bundle is an IIFE
 *   wrapper (kept full-named instead of the legacy `isIife` abbreviation).
 */
export type ScriptAsset = {
    readonly file: string;
    readonly order: number;
    readonly configBinding?: string;
    readonly themeBinding?: string;
    readonly isImmediatelyInvokedFunction?: boolean;
};
