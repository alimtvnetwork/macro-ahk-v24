/**
 * Optional cookie binding metadata attached to a seed. Mirrors the
 * `RiseupAsiaCookieBinding` runtime shape declared in the global
 * namespace types.
 */
export type CookieBinding = {
    readonly cookieName?: string;
    readonly url?: string;
    readonly role?: string;
};
