import { AssetInjectTarget } from "../enums/asset-inject-target";

/**
 * A CSS file shipped with a standalone script and injected into the
 * target page at the location given by `injectInto`.
 */
export type CssAsset = {
    readonly file: string;
    readonly injectInto: AssetInjectTarget;
};
