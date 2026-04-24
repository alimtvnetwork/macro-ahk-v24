/**
 * User Add — flow barrel.
 *
 * P15: Step A — POST membership via shared `LovableApiClient.addMembership`.
 * P16: Step B — Owner promotion via shared `promoteToOwner` (R12).
 * P17: per-row state machine + sign-out.
 */

export { runStepA } from "./run-step-a";
export { StepAStepCode } from "./step-a-types";
export type { StepARequest, StepAResult, StepAStepOutcome } from "./step-a-types";
export { extractWorkspaceId } from "./extract-workspace-id";
export { toStepAApiRole } from "./role-api-mapper";
export { runStepB } from "./run-step-b";
export { StepBStepCode } from "./step-b-types";
export type { StepBRequest, StepBResult, StepBStepOutcome } from "./step-b-types";
export { shouldRunStepB } from "./should-run-step-b";
