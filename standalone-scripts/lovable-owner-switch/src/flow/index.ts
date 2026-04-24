/**
 * Lovable Owner Switch — flow barrel.
 *
 * P8: `runLogin` (login chain).
 * P9: `runPromote` + `TtlCache` + `PromoteCaches` (uses shared
 *     `LovableApiClient.promoteToOwner` — R12 invariant).
 */

export { runLogin } from "./run-login";
export { LoginStepCode } from "./login-types";
export type {
    LoginCredentials,
    LoginFlowOptions,
    LoginStepOutcome,
} from "./login-types";
export type { LoginRunResult } from "./run-login";
export { runPromote } from "./run-promote";
export type { PromoteCaches } from "./run-promote";
export { PromoteStepCode } from "./promote-types";
export type {
    PromoteRowRequest,
    PromoteRowOutcome,
    PromoteRowResult,
} from "./promote-types";
export { TtlCache } from "./ttl-cache";
