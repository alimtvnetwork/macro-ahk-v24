/**
 * A static JSON config file shipped with the script. The runtime
 * exposes the parsed object on the project namespace under `key`
 * (or `injectAs` if provided).
 */
export type ConfigAsset = {
    readonly file: string;
    readonly key: string;
    readonly injectAs?: string;
};
