/**
 * User Add — per-row state machine entry.
 *
 * Two-step chain per row: Step A (POST membership) → if Owner per
 * `shouldRunStepB`, run Step B (PUT promote). Each step writes its
 * own log line via `UserAddLogPhase.StepA` / `UserAddLogPhase.StepB`
 * so the P19 logs viewer can distinguish them without parsing text.
 *
 * Sign-out is task-level (`run-task-sign-out.ts`), not per-row.
 *
 * Single attempt per step, no retry (mem://constraints/no-retry-policy).
 */

import { runStepA } from "./run-step-a";
import { runStepB } from "./run-step-b";
import { shouldRunStepB } from "./should-run-step-b";
import { finalizeUserAddRow } from "./row-finalize";
import { buildRowFailure, buildRowSuccess } from "./row-result-builders";
import { UserAddRowOutcomeCode } from "./row-types";
import { UserAddLogPhase, UserAddLogSeverity, buildUserAddEntry } from "./log-sink";
import type { UserAddLogSink } from "./log-sink";
import type { UserAddRowContext, UserAddRowResult } from "./row-types";
import type { UserAddRowStateStore } from "./row-state-store";
import type { StepAResult } from "./step-a-types";

const noteEditorNormalization = (ctx: UserAddRowContext, sink: UserAddLogSink): void => {
    if (!ctx.Row.WasEditorNormalized) {
        return;
    }

    sink.write(buildUserAddEntry(
        ctx.Task.TaskId, ctx.Row.RowIndex, UserAddLogPhase.Row, UserAddLogSeverity.Info,
        `Row ${ctx.Row.RowIndex} role normalized: Editor → Member (Q3)`,
    ));
};

const logStep = (
    ctx: UserAddRowContext, sink: UserAddLogSink, phase: UserAddLogPhase,
    severity: UserAddLogSeverity, message: string,
): void => {
    sink.write(buildUserAddEntry(ctx.Task.TaskId, ctx.Row.RowIndex, phase, severity, message));
};

const isStepASuccess = (stepA: StepAResult): boolean => {
    return stepA.Error === null && stepA.Membership !== null && stepA.WorkspaceId !== null;
};

export const runUserAddRow = async (
    ctx: UserAddRowContext, sink: UserAddLogSink, store: UserAddRowStateStore,
): Promise<UserAddRowResult> => {
    const startedAt = Date.now();
    noteEditorNormalization(ctx, sink);

    if (ctx.Row.RoleCode === null) {
        return finalizeUserAddRow(ctx, sink, store, buildRowFailure(
            ctx.Row.RowIndex, startedAt, UserAddRowOutcomeCode.StepAFailed,
            "RoleCode missing on row and no DefaultRoleCode applied", false,
        ));
    }

    const stepA = await runStepA(ctx.Api, {
        WorkspaceUrl: ctx.Row.WorkspaceUrl, MemberEmail: ctx.Row.MemberEmail,
        RoleCode: ctx.Row.RoleCode,
    });

    if (!isStepASuccess(stepA) || stepA.Membership === null || stepA.WorkspaceId === null) {
        logStep(ctx, sink, UserAddLogPhase.StepA, UserAddLogSeverity.Error,
            `Step A failed: ${stepA.Error ?? "no membership returned"}`);

        return finalizeUserAddRow(ctx, sink, store, buildRowFailure(
            ctx.Row.RowIndex, startedAt, UserAddRowOutcomeCode.StepAFailed,
            stepA.Error ?? "Step A returned null membership", false,
        ));
    }

    logStep(ctx, sink, UserAddLogPhase.StepA, UserAddLogSeverity.Info,
        `Step A POST membership ok (UserId=${stepA.Membership.UserId})`);

    if (!shouldRunStepB(ctx.Row.RoleCode)) {
        return finalizeUserAddRow(ctx, sink, store, buildRowSuccess(ctx.Row.RowIndex, startedAt, false));
    }

    const stepB = await runStepB(ctx.Api, {
        WorkspaceId: stepA.WorkspaceId, UserId: stepA.Membership.UserId,
    });

    if (stepB.Error !== null) {
        logStep(ctx, sink, UserAddLogPhase.StepB, UserAddLogSeverity.Error,
            `Step B promote failed: ${stepB.Error}`);

        return finalizeUserAddRow(ctx, sink, store, buildRowFailure(
            ctx.Row.RowIndex, startedAt, UserAddRowOutcomeCode.StepBFailed, stepB.Error, true,
        ));
    }

    logStep(ctx, sink, UserAddLogPhase.StepB, UserAddLogSeverity.Info, "Step B PUT promote ok");

    return finalizeUserAddRow(ctx, sink, store, buildRowSuccess(ctx.Row.RowIndex, startedAt, true));
};
