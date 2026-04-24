import type { CssAsset } from "./css-asset";
import type { ConfigAsset } from "./config-asset";
import type { ScriptAsset } from "./script-asset";
import type { TemplateAsset } from "./template-asset";
import type { PromptAsset } from "./prompt-asset";

/**
 * Aggregate of every shipped asset type. Replaces the legacy in-place
 * `assets: { css: Array<{...}>; configs: Array<{...}>; ... }` shape
 * defined inside each project's `instruction.ts`.
 */
export type AssetBundle = {
    readonly css: ReadonlyArray<CssAsset>;
    readonly configs: ReadonlyArray<ConfigAsset>;
    readonly scripts: ReadonlyArray<ScriptAsset>;
    readonly templates: ReadonlyArray<TemplateAsset>;
    readonly prompts: ReadonlyArray<PromptAsset>;
};
