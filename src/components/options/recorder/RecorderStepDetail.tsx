/**
 * Marco Extension — Recorder Step Detail (Phase 10)
 *
 * Right-pane detail view for one selected Step:
 *   - Variable rename (PascalCase free-text, server enforces uniqueness)
 *   - Persisted Selector rows (primary highlighted)
 *   - Bound DataSource column (if any)
 *
 * Selector + binding rows are read from props; rename calls back to parent.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
    StepRow,
    SelectorRow,
    DataSourceRow,
    FieldBindingRow,
} from "@/hooks/use-recorder-project-data";

const SELECTOR_KIND_LABEL: Record<number, string> = {
    1: "XPathFull",
    2: "XPathRelative",
    3: "Css",
    4: "Aria",
};

interface Props {
    step: StepRow;
    selectors: ReadonlyArray<SelectorRow>;
    dataSources: ReadonlyArray<DataSourceRow>;
    bindings: ReadonlyArray<FieldBindingRow>;
    onRename: (stepId: number, newName: string) => Promise<void>;
}

export function RecorderStepDetail({ step, selectors, dataSources, bindings, onRename }: Props) {
    const [draftName, setDraftName] = useState(step.VariableName);
    const [renameError, setRenameError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setDraftName(step.VariableName);
        setRenameError(null);
    }, [step.StepId, step.VariableName]);

    const isDirty = draftName !== step.VariableName;
    const binding = bindings.find((b) => b.StepId === step.StepId) ?? null;
    const boundDs = binding ? dataSources.find((d) => d.DataSourceId === binding.DataSourceId) : null;

    const handleSave = async () => {
        if (!isDirty) return;
        setIsSaving(true);
        setRenameError(null);
        try {
            await onRename(step.StepId, draftName.trim());
        } catch (err) {
            setRenameError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Identity */}
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Variable
                </h3>
                <div className="flex gap-2">
                    <Input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="font-mono text-sm h-8"
                    />
                    <Button size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
                        {isSaving ? "Saving…" : "Rename"}
                    </Button>
                </div>
                {renameError && (
                    <p className="text-xs text-destructive font-mono">{renameError}</p>
                )}
                <div className="text-[10px] text-muted-foreground font-mono">
                    StepId={step.StepId} • OrderIndex={step.OrderIndex} • Captured {step.CapturedAt}
                </div>
            </section>

            {/* Selectors */}
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Selectors ({selectors.length})
                </h3>
                {selectors.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No selectors persisted.</p>
                ) : (
                    <ul className="space-y-1.5">
                        {selectors.map((sel) => (
                            <li
                                key={sel.SelectorId}
                                className={`rounded-md border px-2.5 py-2 text-xs space-y-1 ${
                                    sel.IsPrimary === 1
                                        ? "border-primary/60 bg-primary/5"
                                        : "border-border bg-card"
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                                        {SELECTOR_KIND_LABEL[sel.SelectorKindId] ?? `Kind${sel.SelectorKindId}`}
                                    </Badge>
                                    {sel.IsPrimary === 1 && (
                                        <Badge className="text-[10px] py-0 px-1.5 bg-primary text-primary-foreground">
                                            Primary
                                        </Badge>
                                    )}
                                    {sel.AnchorSelectorId !== null && (
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                            anchor=#{sel.AnchorSelectorId}
                                        </span>
                                    )}
                                </div>
                                <code className="block font-mono text-[11px] break-all text-foreground/90">
                                    {sel.Expression}
                                </code>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Field binding */}
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Field Binding
                </h3>
                {binding === null ? (
                    <p className="text-xs text-muted-foreground italic">
                        No data-source column bound to this step.
                    </p>
                ) : (
                    <div className="rounded-md border border-border bg-card px-2.5 py-2 text-xs space-y-1">
                        <div className="font-mono">
                            <span className="text-primary">{`{{${binding.ColumnName}}}`}</span>{" "}
                            <span className="text-muted-foreground">→</span>{" "}
                            <span>{boundDs?.FilePath ?? `DataSourceId=${binding.DataSourceId}`}</span>
                        </div>
                        {boundDs && (
                            <div className="text-[10px] text-muted-foreground">
                                Columns: {boundDs.Columns.join(", ")} • Rows: {boundDs.RowCount}
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
