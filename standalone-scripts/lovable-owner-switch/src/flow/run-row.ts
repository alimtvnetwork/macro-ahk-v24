/**
 * Owner Switch — per-row state machine.
 *
 * Single function per state transition; outermost `runRow` chains them
 * and writes the typed result. NO retries on Login/Promote — fail-fast
 * per `mem://constraints/no-retry-policy`. Sign-out is best-effort
 * (Q6 default).
 *
 * Each phase emits a typed log entry via the injected `LogSink`. The
 * row's password is resolved from `Row.Password ?? Task.CommonPassword`;
 * if both are null the row is recorded as `PasswordMissing` and the
 * flow short-circuits without touching the page.
 */

import { runLogin } from "./run-login";
import { runPromote } from "./run-promote";
import { runSignOut } from "./run-sign-out";
import { RowOutcomeCode } from "./row-types";
import { LogPhase, LogSeverity, buildEntry } from "./log-sink";
import type { RowExecutionContext, RowExecutionResult } from "./row-types";
import type { LogSink } from "./log-sink";
import type { RowStateStore, RowStateUpdate } from "./row-state-store";

const resolvePassword = (ctx: RowExecutionContext): string | null => {
    return ctx.Row.Password ?? ctx.Task.CommonPassword;
};

const buildUpdate = (rowIndex: number, result: RowExecutionResult): RowStateUpdate => ({
    RowIndex: rowIndex,
    IsDone: result.IsDone,
    HasError: result.HasError,
    LastError: result.LastError,
    CompletedAtUtc: result.IsDone ? new Date().toISOString() : null,
});

const finalize = (
    ctx: RowExecutionContext,
    sink: LogSink,
    store: RowStateStore,
    result: RowExecutionResult,
): RowExecutionResult => {
    sink.write(buildEntry(
        ctx.Task.TaskId, ctx.Row.RowIndex, LogPhase.Row,
        result.HasError ? LogSeverity.Error : LogSeverity.Info,
        `Row ${ctx.Row.RowIndex} → ${result.Outcome} in ${result.DurationMs}ms`,
    ));
    store.update(buildUpdate(ctx.Row.RowIndex, result));

    return result;
};

const runOwnerEmails = async (
    ctx: RowExecutionContext,
    sink: LogSink,
): Promise<{ failedAt: string | null; error: string | null }> => {
    const targets: string[] = [ctx.Row.OwnerEmail1];

    if (ctx.Row.OwnerEmail2 !== null) {
        targets.push(ctx.Row.OwnerEmail2);
    }

    for (const ownerEmail of targets) {
        const promote = await runPromote(ctx.Api, ctx.Caches, {
            LoginEmail: ctx.Row.LoginEmail, OwnerEmail: ownerEmail,
        });
        sink.write(buildEntry(
            ctx.Task.TaskId, ctx.Row.RowIndex, LogPhase.Promote,
            promote.Error === null ? LogSeverity.Info : LogSeverity.Error,
            `Promote ${ownerEmail}: ${promote.Error ?? "ok"}`,
        ));

        if (promote.Error !== null) {
            return { failedAt: ownerEmail, error: promote.Error };
        }
    }

    return { failedAt: null, error: null };
};

const passwordMissing = (
    ctx: RowExecutionContext, sink: LogSink, store: RowStateStore, startedAt: number,
): RowExecutionResult => {
    return finalize(ctx, sink, store, {
        RowIndex: ctx.Row.RowIndex,
        Outcome: RowOutcomeCode.PasswordMissing,
        IsDone: false, HasError: true,
        LastError: "Password missing on row and no CommonPassword fallback",
        DurationMs: Date.now() - startedAt,
    });
};

export const runRow = async (
    ctx: RowExecutionContext,
    sink: LogSink,
    store: RowStateStore,
): Promise<RowExecutionResult> => {
    const startedAt = Date.now();
    const password = resolvePassword(ctx);

    if (password === null) {
        return passwordMissing(ctx, sink, store, startedAt);
    }

    const login = await runLogin({
        Credentials: { LoginEmail: ctx.Row.LoginEmail, Password: password },
        LoginUrl: ctx.Task.LoginUrl,
    }, ctx.XPathOverrides);

    if (login.Error !== null) {
        return finalize(ctx, sink, store, {
            RowIndex: ctx.Row.RowIndex, Outcome: RowOutcomeCode.LoginFailed,
            IsDone: false, HasError: true, LastError: login.Error,
            DurationMs: Date.now() - startedAt,
        });
    }

    const promote = await runOwnerEmails(ctx, sink);

    if (promote.error !== null) {
        await runSignOut(ctx.XPathOverrides);

        return finalize(ctx, sink, store, {
            RowIndex: ctx.Row.RowIndex, Outcome: RowOutcomeCode.PromoteFailed,
            IsDone: false, HasError: true,
            LastError: `${promote.failedAt}: ${promote.error}`,
            DurationMs: Date.now() - startedAt,
        });
    }

    const signOut = await runSignOut(ctx.XPathOverrides);

    if (!signOut.Succeeded) {
        sink.write(buildEntry(
            ctx.Task.TaskId, ctx.Row.RowIndex, LogPhase.SignOut,
            LogSeverity.Warn, `Sign-out best-effort failed: ${signOut.Error ?? "unknown"}`,
        ));
    }

    return finalize(ctx, sink, store, {
        RowIndex: ctx.Row.RowIndex, Outcome: RowOutcomeCode.Succeeded,
        IsDone: true, HasError: false, LastError: null,
        DurationMs: Date.now() - startedAt,
    });
};
