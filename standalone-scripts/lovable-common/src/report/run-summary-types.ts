/**
 * Run Summary — shared types + renderers for per-run reports.
 *
 * Both `lovable-owner-switch` and `lovable-user-add` produce a
 * `RunSummary` after a task completes. The summary is **storage-
 * agnostic**: it is built in pure code from the row results + log
 * entries the scripts already persist. Two output formats are emitted:
 *
 *   • JSON  — stable PascalCase keys, suitable for downstream tooling
 *             (CI dashboards, audit pipelines).
 *   • Text  — Markdown-flavoured human report listing every row, the
 *             actions taken, and the success/failure reason.
 *
 * No-rollback policy (mem://constraints/no-retry-policy) is reflected
 * in the renderers: failed rows surface the persisted replay hints
 * (`PromotedOwners` / `WorkspaceId`+`UserId`+`StepASucceeded`) so an
 * operator can re-run idempotently without rolling back.
 */

export enum RunSummaryScriptCode {
    OwnerSwitch = "OwnerSwitch",
    UserAdd = "UserAdd",
}

export enum RunSummaryRowStatus {
    Succeeded = "Succeeded",
    Failed = "Failed",
    PartiallySucceeded = "PartiallySucceeded",
}

export interface RunSummaryAction {
    /** Stable code (e.g. "ResolveWorkspace", "PromoteToOwner", "AddMembership"). */
    Code: string;
    /** "ok" / "skipped" / "failed". */
    Outcome: "ok" | "skipped" | "failed";
    /** Free-text detail (email, IDs, error message). */
    Detail: string | null;
}

export interface RunSummaryRow {
    RowIndex: number;
    Status: RunSummaryRowStatus;
    /** Outcome enum value persisted on the row (e.g. "PromoteFailedPartial"). */
    OutcomeCode: string;
    DurationMs: number;
    LastError: string | null;
    Actions: ReadonlyArray<RunSummaryAction>;
    /**
     * Replay hint: free-form structured data the operator needs to
     * re-execute the row safely. Keys are PascalCase and stable.
     */
    ReplayHint: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RunSummaryCounts {
    Total: number;
    Succeeded: number;
    Failed: number;
    PartiallySucceeded: number;
}

export interface RunSummary {
    Script: RunSummaryScriptCode;
    TaskId: string;
    GeneratedAtUtc: string;
    Counts: RunSummaryCounts;
    Rows: ReadonlyArray<RunSummaryRow>;
    /** Aggregated WARN/ERROR messages emitted during the run. */
    Notices: ReadonlyArray<string>;
}

const STATUS_LABEL: Readonly<Record<RunSummaryRowStatus, string>> = Object.freeze({
    [RunSummaryRowStatus.Succeeded]: "✓",
    [RunSummaryRowStatus.Failed]: "✗",
    [RunSummaryRowStatus.PartiallySucceeded]: "◐",
});

export const renderRunSummaryAsJson = (summary: RunSummary): string => {
    return JSON.stringify(summary, null, 2);
};

const renderActions = (actions: ReadonlyArray<RunSummaryAction>): string => {
    if (actions.length === 0) {
        return "    (no actions recorded)";
    }

    return actions
        .map((a) => `    - [${a.Outcome}] ${a.Code}${a.Detail === null ? "" : ` — ${a.Detail}`}`)
        .join("\n");
};

const renderReplayHint = (hint: RunSummaryRow["ReplayHint"]): string => {
    const keys = Object.keys(hint);

    if (keys.length === 0) {
        return "    (none)";
    }

    return keys.map((k) => `    - ${k}: ${String(hint[k])}`).join("\n");
};

const renderRow = (row: RunSummaryRow): string => {
    const header = `### Row ${row.RowIndex} ${STATUS_LABEL[row.Status]} ${row.OutcomeCode} (${row.DurationMs}ms)`;
    const error = row.LastError === null ? "" : `\n  Error: ${row.LastError}`;

    return `${header}${error}\n  Actions:\n${renderActions(row.Actions)}\n  Replay hint:\n${renderReplayHint(row.ReplayHint)}`;
};

export const renderRunSummaryAsText = (summary: RunSummary): string => {
    const head = [
        `# Run Summary — ${summary.Script}`,
        `Task: ${summary.TaskId}`,
        `Generated: ${summary.GeneratedAtUtc}`,
        "",
        `Total: ${summary.Counts.Total} | ` +
        `Succeeded: ${summary.Counts.Succeeded} | ` +
        `Failed: ${summary.Counts.Failed} | ` +
        `Partial: ${summary.Counts.PartiallySucceeded}`,
        "",
    ].join("\n");

    const body = summary.Rows.map(renderRow).join("\n\n");
    const notices = summary.Notices.length === 0
        ? ""
        : `\n\n## Notices\n${summary.Notices.map((n) => `- ${n}`).join("\n")}`;

    return `${head}\n${body}${notices}\n`;
};
