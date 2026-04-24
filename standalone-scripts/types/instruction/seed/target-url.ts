import { MatchType } from "../enums/match-type";
import type { UrlPattern } from "../primitives/url-pattern";

/**
 * One URL pattern used by the injection scheduler. `matchType`
 * disambiguates how `pattern` is evaluated.
 */
export type TargetUrl = {
    readonly pattern: UrlPattern;
    readonly matchType: MatchType;
};
