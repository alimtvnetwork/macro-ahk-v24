/**
 * Lovable Owner Switch — flow barrel.
 *
 * P8 surface: `runLogin` is the single entry the per-row state machine
 * (P10) calls before invoking the promote step (P9).
 */

export { runLogin } from "./run-login";
export { LoginStepCode } from "./login-types";
export type {
    LoginCredentials,
    LoginFlowOptions,
    LoginStepOutcome,
} from "./login-types";
export type { LoginRunResult } from "./run-login";
