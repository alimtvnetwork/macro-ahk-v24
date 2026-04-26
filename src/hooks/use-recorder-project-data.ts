/**
 * Marco Extension — Recorder Project Data Hook
 *
 * Phase 10 — Project Visualisation.
 *
 * Loads the four recorder-scoped collections for one project:
 *   - Steps (ordered by OrderIndex ASC)
 *   - Selectors per Step (lazily, on demand)
 *   - DataSources
 *   - FieldBindings
 *
 * Exposes a single `reload()` so the panel can refresh after rename/delete.
 *
 * @see spec/31-macro-recorder/10-project-visualisation.md
 */

import { useCallback, useEffect, useState } from "react";
import { sendMessage } from "@/lib/message-client";

/* ------------------------------------------------------------------ */
/*  PascalCase row shapes (mirror server records)                      */
/* ------------------------------------------------------------------ */

export interface StepRow {
    readonly StepId: number;
    readonly StepKindId: number;
    readonly StepStatusId: number;
    readonly OrderIndex: number;
    readonly VariableName: string;
    readonly Label: string;
    readonly InlineJs: string | null;
    readonly IsBreakpoint: number;
    readonly CapturedAt: string;
    readonly UpdatedAt: string;
}

export interface SelectorRow {
    readonly SelectorId: number;
    readonly StepId: number;
    readonly SelectorKindId: number;
    readonly Expression: string;
    readonly AnchorSelectorId: number | null;
    readonly IsPrimary: number;
}

export interface DataSourceRow {
    readonly DataSourceId: number;
    readonly DataSourceKindId: number;
    readonly FilePath: string;
    readonly Columns: ReadonlyArray<string>;
    readonly RowCount: number;
    readonly CreatedAt: string;
}

export interface FieldBindingRow {
    readonly FieldBindingId: number;
    readonly StepId: number;
    readonly DataSourceId: number;
    readonly ColumnName: string;
    readonly CreatedAt: string;
}

export interface RecorderProjectData {
    readonly steps: ReadonlyArray<StepRow>;
    readonly dataSources: ReadonlyArray<DataSourceRow>;
    readonly bindings: ReadonlyArray<FieldBindingRow>;
}

interface HookResult {
    data: RecorderProjectData | null;
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
    loadSelectors: (stepId: number) => Promise<ReadonlyArray<SelectorRow>>;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useRecorderProjectData(projectSlug: string): HookResult {
    const [data, setData] = useState<RecorderProjectData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!projectSlug) return;
        setLoading(true);
        setError(null);
        try {
            const [stepsRes, dsRes, fbRes] = await Promise.all([
                sendMessage<{ steps: ReadonlyArray<StepRow> }>({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    type: "RECORDER_STEP_LIST" as any,
                    projectSlug,
                }),
                sendMessage<{ dataSources: ReadonlyArray<DataSourceRow> }>({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    type: "RECORDER_DATA_SOURCE_LIST" as any,
                    projectSlug,
                }),
                sendMessage<{ bindings: ReadonlyArray<FieldBindingRow> }>({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    type: "RECORDER_FIELD_BINDING_LIST" as any,
                    projectSlug,
                }),
            ]);
            setData({
                steps: stepsRes.steps ?? [],
                dataSources: dsRes.dataSources ?? [],
                bindings: fbRes.bindings ?? [],
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setData({ steps: [], dataSources: [], bindings: [] });
        } finally {
            setLoading(false);
        }
    }, [projectSlug]);

    const loadSelectors = useCallback(
        async (stepId: number): Promise<ReadonlyArray<SelectorRow>> => {
            const list = await sendMessage<{ selectors: ReadonlyArray<SelectorRow> }>({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: "RECORDER_STEP_SELECTORS_LIST" as any,
                projectSlug,
                stepId,
            }).catch(() => ({ selectors: [] as ReadonlyArray<SelectorRow> }));
            return list.selectors;
        },
        [projectSlug],
    );

    useEffect(() => {
        void reload();
    }, [reload]);

    return { data, loading, error, reload, loadSelectors };
}
