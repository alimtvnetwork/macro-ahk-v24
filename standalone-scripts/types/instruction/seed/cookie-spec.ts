/**
 * One cookie that the seed expects to be present. `name` + `domain`
 * are required; the remaining fields mirror Chrome's
 * `chrome.cookies.Cookie` surface.
 */
export type CookieSpec = {
    readonly name: string;
    readonly domain: string;
    readonly path?: string;
    readonly httpOnly?: boolean;
    readonly secure?: boolean;
};
