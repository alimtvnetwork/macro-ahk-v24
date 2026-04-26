/**
 * Marco Extension — Recorder Step Handler
 *
 * Phase 09 — Macro Recorder.
 *
 * Background-side message handlers for Step + Selector persistence and
 * deterministic replay-XPath resolution.
 *
 * Messages:
 *   - RECORDER_STEP_INSERT   → insert one Step + 1..N Selectors.
 *   - RECORDER_STEP_LIST     → list every Step in the project, ordered by
 *                              `OrderIndex` ASC.
 *   - RECORDER_STEP_DELETE   → cascade-delete a Step (Selectors and
 *                              FieldBindings drop via FK).
 *   - RECORDER_STEP_RESOLVE  → return the deterministic XPath/Css/Aria
 *                              expression that the replay engine should
 *                              evaluate for the given StepId.
 *
 * @see spec/31-macro-recorder/09-step-persistence-and-replay.md
 */

import type { MessageRequest } from "../../shared/messages";
import {
    insertStep,
    listSteps,
    listSelectors,
    deleteStep,
    updateStepVariableName,
    type PersistedStep,
    type PersistedSelector,
    type StepDraft,
} from "../recorder/step-persistence";
import {
    resolveStepSelector,
    type ResolvedSelector,
} from "../recorder/replay-resolver";

interface InsertRequest {
    projectSlug: string;
    draft: StepDraft;
}

interface ListRequest {
    projectSlug: string;
}

interface DeleteRequest {
    projectSlug: string;
    stepId: number;
}

interface ResolveRequest {
    projectSlug: string;
    stepId: number;
}

/* ------------------------------------------------------------------ */
/*  Insert                                                             */
/* ------------------------------------------------------------------ */

export async function handleRecorderStepInsert(
    message: MessageRequest,
): Promise<{
    isOk: true;
    step: PersistedStep;
    selectors: ReadonlyArray<PersistedSelector>;
}> {
    const req = message as unknown as InsertRequest;
    if (!req.projectSlug || !req.draft) {
        throw new Error("RECORDER_STEP_INSERT requires projectSlug and draft");
    }
    const { step, selectors } = await insertStep(req.projectSlug, req.draft);
    return { isOk: true, step, selectors };
}

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

export async function handleRecorderStepList(
    message: MessageRequest,
): Promise<{ steps: ReadonlyArray<PersistedStep> }> {
    const req = message as unknown as ListRequest;
    if (!req.projectSlug) {
        throw new Error("RECORDER_STEP_LIST requires projectSlug");
    }
    const steps = await listSteps(req.projectSlug);
    return { steps };
}

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */

export async function handleRecorderStepDelete(
    message: MessageRequest,
): Promise<{ isOk: true }> {
    const req = message as unknown as DeleteRequest;
    if (!req.projectSlug || typeof req.stepId !== "number") {
        throw new Error("RECORDER_STEP_DELETE requires projectSlug and stepId");
    }
    await deleteStep(req.projectSlug, req.stepId);
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  Resolve (replay contract)                                          */
/* ------------------------------------------------------------------ */

export async function handleRecorderStepResolve(
    message: MessageRequest,
): Promise<{ resolved: ResolvedSelector }> {
    const req = message as unknown as ResolveRequest;
    if (!req.projectSlug || typeof req.stepId !== "number") {
        throw new Error("RECORDER_STEP_RESOLVE requires projectSlug and stepId");
    }
    const selectors = await listSelectors(req.projectSlug, req.stepId);
    if (selectors.length === 0) {
        throw new Error(`Step ${req.stepId} has no selectors persisted`);
    }
    const resolved = resolveStepSelector(selectors);
    return { resolved };
}
