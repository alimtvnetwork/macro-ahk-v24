/**
 * An HTML or text template shipped with the script. The runtime
 * registers the parsed template on the project namespace under
 * `injectAs` (or the file's basename if omitted).
 */
export type TemplateAsset = {
    readonly file: string;
    readonly injectAs?: string;
};
