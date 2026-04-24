/**
 * Owner Switch — owner-promotion sub-flow.
 *
 * Iterates the 1–2 OwnerEmails per row, calling shared `runPromote`
 * (R12) and emitting one log entry per attempt. Returns the first
 * failure (fail-fast) or null on success.
 */

import { runPromote } from "./run-promote";
import { LogPhase, LogSeverity, buildEntry } from "./log-sink";
import type { LogSink } from "./log-sink";
import type { RowExecutionContext } from "./row-types";

export interface OwnerEmailFailure {
    Email: string;
    Error: string;
}

const collectTargets = (ctx: RowExecutionContext): string[] => {
    const targets: string[] = [ctx.Row.OwnerEmail1];

    if (ctx.Row.OwnerEmail2 !== null) {
        targets.push(ctx.Row.OwnerEmail2);
    }

    return targets;
};

const logPromote = (
    ctx: RowExecutionContext, sink: LogSink, ownerEmail: string, error: string | null,
): void => {
    sink.write(buildEntry(
        ctx.Task.TaskId, ctx.Row.RowIndex, LogPhase.Promote,
        error === null ? LogSeverity.Info : LogSeverity.Error,
        `Promote ${ownerEmail}: ${error ?? "ok"}`,
    ));
};

export const runOwnerEmails = async (
    ctx: RowExecutionContext, sink: LogSink,
): Promise<OwnerEmailFailure | null> => {
    for (const ownerEmail of collectTargets(ctx)) {
        const promote = await runPromote(ctx.Api, ctx.Caches, {
            LoginEmail: ctx.Row.LoginEmail, OwnerEmail: ownerEmail,
        });
        logPromote(ctx, sink, ownerEmail, promote.Error);

        if (promote.Error !== null) {
            return { Email: ownerEmail, Error: promote.Error };
        }
    }

    return null;
};
