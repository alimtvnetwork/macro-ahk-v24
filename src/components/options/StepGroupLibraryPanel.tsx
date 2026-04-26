/**
 * Marco Extension — Step Group Library Panel
 *
 * Two-pane Options page surface for browsing the recorder's step
 * groups, selecting them for import/export, and performing CRUD.
 *
 * Layout:
 *   ┌──────────────── Toolbar ──────────────┐
 *   │  Project · selected count · [New]     │
 *   │  [Import ZIP]  [Export Selected]      │
 *   ├────────────────┬──────────────────────┤
 *   │  Tree pane     │  Step preview pane   │
 *   │  (checkboxes,  │  (active group's     │
 *   │  ⋯ row menu)   │   ordered steps)     │
 *   └────────────────┴──────────────────────┘
 *
 * Data layer is the in-memory `useStepLibrary` hook (sql.js, persisted
 * to localStorage). All export/import calls go through the pure
 * modules (`runStepGroupExport` / `runStepGroupImport`) so the same
 * code paths the unit tests cover are what the user clicks.
 *
 * @see src/hooks/use-step-library.ts
 * @see src/background/recorder/step-library/export-bundle.ts
 * @see src/background/recorder/step-library/import-bundle.ts
 */

import { useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
    Archive,
    ArchiveRestore,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ChevronDown as ChevronDownIcon,
    Download,
    FileJson,
    FileSpreadsheet,
    FilePlus2,
    FolderTree,
    Globe,
    GripVertical,
    MoreHorizontal,
    Pencil,
    Play,
    Plus,
    Trash2,
    Upload,
    Webhook,
    Timer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";

import { stepKindLabel, useStepLibrary } from "@/hooks/use-step-library";
import type { StepGroupRow, StepRow } from "@/background/recorder/step-library/db";
import { StepKindId } from "@/background/recorder/step-library/schema";
import { runStepGroupExport } from "@/background/recorder/step-library/export-bundle";
import { runStepGroupImport } from "@/background/recorder/step-library/import-bundle";
import BatchRunDialog from "./BatchRunDialog";
import BundleExchangePanel, {
    type LastExportSummary,
    type LastImportSummary,
} from "./BundleExchangePanel";
import ImportErrorDialog from "./ImportErrorDialog";
import { GroupInputsDialog } from "./GroupInputsDialog";
import { CsvInputDialog } from "./CsvInputDialog";
import WebhookSettingsDialog from "./WebhookSettingsDialog";
import InputSourceDialog from "./InputSourceDialog";
import StepWaitDialog from "./StepWaitDialog";
import {
    readAllStepWaits,
    type WaitConfig,
} from "@/background/recorder/step-library/step-wait";
import {
    explainImportFailure,
    type ImportErrorExplanation,
} from "@/background/recorder/step-library/import-error-explainer";

/* ------------------------------------------------------------------ */
/*  Tree shape                                                         */
/* ------------------------------------------------------------------ */

interface TreeNode {
    readonly Group: StepGroupRow;
    readonly Children: TreeNode[];
}

function buildTree(groups: ReadonlyArray<StepGroupRow>): TreeNode[] {
    const byParent = new Map<number | null, StepGroupRow[]>();
    for (const g of groups) {
        const key = g.ParentStepGroupId ?? null;
        const arr = byParent.get(key) ?? [];
        arr.push(g);
        byParent.set(key, arr);
    }
    const visit = (parentId: number | null): TreeNode[] => {
        const kids = byParent.get(parentId) ?? [];
        kids.sort((a, b) => a.OrderIndex - b.OrderIndex || a.Name.localeCompare(b.Name));
        return kids.map((g) => ({ Group: g, Children: visit(g.StepGroupId) }));
    };
    return visit(null);
}

function collectDescendantIds(node: TreeNode, out: Set<number>): void {
    out.add(node.Group.StepGroupId);
    for (const c of node.Children) collectDescendantIds(c, out);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StepGroupLibraryPanel() {
    const lib = useStepLibrary();
    const [selected, setSelected] = useState<Set<number>>(new Set());
    /**
     * Caller-visible insertion order of `selected`. Plain JS Sets do
     * preserve insertion order, but we keep an explicit array because
     * `toggleSubtree` adds many ids at once and we want the **first
     * encountered** ordering (top-of-tree first), which we cannot
     * recover from a Set after re-toggles.
     */
    const [selectionOrder, setSelectionOrder] = useState<ReadonlyArray<number>>([]);
    const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [showArchived, setShowArchived] = useState(false);
    const [batchOpen, setBatchOpen] = useState(false);
    const [webhookOpen, setWebhookOpen] = useState(false);
    const [inputSourceOpen, setInputSourceOpen] = useState(false);
    const [waitDialog, setWaitDialog] = useState<{ open: boolean; stepId: number | null; stepLabel: string | null }>({
        open: false, stepId: null, stepLabel: null,
    });
    const [stepWaits, setStepWaits] = useState<ReadonlyMap<number, WaitConfig>>(() => readAllStepWaits());
    const refreshStepWaits = () => setStepWaits(readAllStepWaits());
    const [lastExport, setLastExport] = useState<LastExportSummary | null>(null);
    const [lastImport, setLastImport] = useState<LastImportSummary | null>(null);
    const [importError, setImportError] = useState<{
        open: boolean;
        explanation: ImportErrorExplanation | null;
        fileName: string | null;
    }>({ open: false, explanation: null, fileName: null });

    /**
     * Tracks the *exact* (innermost) StepGroup row currently under the
     * cursor. Lifted to panel scope so a hovered child does not also
     * light up its ancestor `<li>` wrappers — only the deepest node
     * with `hoveredId === id` renders the highlighter.
     */
    const [hoveredId, setHoveredId] = useState<number | null>(null);

    // Dialog state
    const [createDialog, setCreateDialog] = useState<{ open: boolean; parent: number | null; name: string }>({
        open: false, parent: null, name: "",
    });
    const [renameDialog, setRenameDialog] = useState<{ open: boolean; group: StepGroupRow | null; name: string }>({
        open: false, group: null, name: "",
    });
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; group: StepGroupRow | null }>({
        open: false, group: null,
    });
    /**
     * Per-group input-data dialog. We track the *target* group on the
     * dialog itself rather than relying on `activeGroupId` so opening
     * from a row dropdown menu doesn't have to first activate the row.
     */
    const [inputsDialog, setInputsDialog] = useState<{ open: boolean; group: StepGroupRow | null }>({
        open: false, group: null,
    });
    /**
     * Per-group CSV importer dialog. Same target shape as the JSON
     * variant — both feed `setGroupInput` with the resulting bag.
     */
    const [csvDialog, setCsvDialog] = useState<{ open: boolean; group: StepGroupRow | null }>({
        open: false, group: null,
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filter archived groups out of the tree by default. When the user
    // flips the toggle they remain visible but render greyed-out (the
    // TreeNodeRow handles the visual state via `node.Group.IsArchived`).
    const visibleGroups = useMemo(
        () => (showArchived ? lib.Groups : lib.Groups.filter((g) => !g.IsArchived)),
        [lib.Groups, showArchived],
    );
    const tree = useMemo(() => buildTree(visibleGroups), [visibleGroups]);
    const activeGroup = useMemo(
        () => lib.Groups.find((g) => g.StepGroupId === activeGroupId) ?? null,
        [lib.Groups, activeGroupId],
    );
    const activeSteps: ReadonlyArray<StepRow> =
        activeGroupId === null ? [] : (lib.StepsByGroup.get(activeGroupId) ?? []);
    const groupsById = useMemo(() => {
        const m = new Map<number, StepGroupRow>();
        for (const g of lib.Groups) m.set(g.StepGroupId, g);
        return m;
    }, [lib.Groups]);

    /* ------------------------ Selection --------------------------- */

    const applySelection = (on: boolean, ids: ReadonlyArray<number>) => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
                if (on) next.add(id); else next.delete(id);
            }
            return next;
        });
        setSelectionOrder((prev) => {
            if (!on) return prev.filter((id) => !ids.includes(id));
            const seen = new Set(prev);
            const additions = ids.filter((id) => !seen.has(id));
            return additions.length === 0 ? prev : [...prev, ...additions];
        });
    };

    const toggleOne = (id: number, on: boolean) => {
        applySelection(on, [id]);
    };

    const toggleSubtree = (node: TreeNode, on: boolean) => {
        const ids = new Set<number>();
        collectDescendantIds(node, ids);
        applySelection(on, Array.from(ids));
    };

    const clearSelection = () => {
        setSelected(new Set());
        setSelectionOrder([]);
    };

    const toggleExpanded = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    /* ------------------------ Mutations --------------------------- */

    const handleCreate = () => {
        const name = createDialog.name.trim();
        if (name === "") {
            toast.error("Group name is required");
            return;
        }
        try {
            const newId = lib.createGroup({ Name: name, ParentStepGroupId: createDialog.parent });
            setCreateDialog({ open: false, parent: null, name: "" });
            setActiveGroupId(newId);
            if (createDialog.parent !== null) {
                setExpanded((p) => new Set(p).add(createDialog.parent as number));
            }
            toast.success(`Created “${name}”`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Create failed");
        }
    };

    const handleRename = () => {
        if (renameDialog.group === null) return;
        const name = renameDialog.name.trim();
        if (name === "") {
            toast.error("Group name is required");
            return;
        }
        try {
            lib.renameGroup(renameDialog.group.StepGroupId, name);
            toast.success(`Renamed to “${name}”`);
            setRenameDialog({ open: false, group: null, name: "" });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Rename failed");
        }
    };

    const handleDelete = () => {
        if (deleteDialog.group === null) return;
        const id = deleteDialog.group.StepGroupId;
        try {
            lib.deleteGroup(id);
            setSelected((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            setSelectionOrder((prev) => prev.filter((sid) => sid !== id));
            if (activeGroupId === id) setActiveGroupId(null);
            toast.success(`Deleted “${deleteDialog.group.Name}”`);
            setDeleteDialog({ open: false, group: null });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Delete failed");
        }
    };

    const handleMove = (id: number, direction: "up" | "down") => {
        try {
            lib.moveGroupWithinParent(id, direction);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Move failed");
        }
    };

    const handleArchiveToggle = (group: StepGroupRow) => {
        const next = !group.IsArchived;
        try {
            lib.setGroupArchived(group.StepGroupId, next);
            toast.success(next ? `Archived “${group.Name}”` : `Restored “${group.Name}”`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Archive failed");
        }
    };

    /**
     * Drag-and-drop within siblings ONLY. Cross-parent drag is
     * intentionally out of scope here — moving across parents has
     * additional invariants (depth check, name uniqueness) that
     * deserve their own dialog. Sibling-only drag covers the common
     * "I want this group above that one" case without surprises.
     */
    const handleDropReorder = (
        parentId: number | null,
        sourceId: number,
        targetId: number,
    ) => {
        if (sourceId === targetId) return;
        const siblings = visibleGroups
            .filter((g) => (g.ParentStepGroupId ?? null) === parentId)
            .sort((a, b) => a.OrderIndex - b.OrderIndex || a.Name.localeCompare(b.Name))
            .map((g) => g.StepGroupId);
        const fromIdx = siblings.indexOf(sourceId);
        const toIdx = siblings.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return;
        const next = siblings.slice();
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, sourceId);
        try {
            lib.reorderSiblings(parentId, next);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Reorder failed");
        }
    };

    /* ------------------------ Export / Import --------------------- */

    const handleExport = async (idsOverride?: ReadonlyArray<number>) => {
        if (lib.Lib === null || lib.Project === null || lib.SqlJs === null) {
            toast.error("Library not ready");
            return;
        }
        const ids = idsOverride ?? Array.from(selected);
        if (ids.length === 0) {
            toast.error("Select at least one group to export");
            return;
        }
        const result = await runStepGroupExport({
            Source: lib.Lib,
            ProjectId: lib.Project.ProjectId,
            SelectedStepGroupIds: ids,
            IncludeDescendants: true,
            BundleName: `${lib.Project.Name} — ${ids.length} group(s)`,
            SqlJs: lib.SqlJs,
            JsZip: JSZip,
        });
        if (result.Reason !== "Ok") {
            toast.error(`Export failed: ${result.Reason}`, { description: result.Detail });
            return;
        }
        // Trigger browser download via blob URL.
        const blob = new Blob([result.ZipBytes as BlobPart], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.ZipFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setLastExport({
            FileName: result.ZipFileName,
            GroupCount: result.Manifest.Counts.StepGroups,
            StepCount: result.Manifest.Counts.Steps,
            At: new Date().toISOString(),
        });
        toast.success(
            `Exported ${result.Manifest.Counts.StepGroups} group(s)`,
            { description: `${result.Manifest.Counts.Steps} steps · ${result.ZipFileName}` },
        );
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleImportFile = async (file: File) => {
        if (lib.Lib === null || lib.Project === null || lib.SqlJs === null) {
            toast.error("Library not ready");
            return;
        }
        const ab = await file.arrayBuffer();
        const result = await runStepGroupImport({
            ZipBytes: new Uint8Array(ab),
            Destination: lib.Lib,
            DestinationProjectId: lib.Project.ProjectId,
            OnNameConflict: "Rename",
            SqlJs: lib.SqlJs,
            JsZip: JSZip,
        });
        if (result.Reason !== "Ok") {
            const explanation = explainImportFailure(result);
            setImportError({ open: true, explanation, fileName: file.name });
            toast.error(explanation.Title, { description: "See dialog for details" });
            return;
        }
        lib.refresh();
        const renames = result.RenamedRoots.length;
        setLastImport({
            GroupCount: result.Counts.StepGroups,
            StepCount: result.Counts.Steps,
            RenameCount: renames,
            At: new Date().toISOString(),
        });
        toast.success(
            `Imported ${result.Counts.StepGroups} group(s)`,
            {
                description:
                    `${result.Counts.Steps} steps` +
                    (renames > 0 ? ` · ${renames} renamed to avoid conflicts` : ""),
            },
        );
    };

    /* ------------------------ Render ------------------------------ */

    if (lib.Loading) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                Loading step library…
            </div>
        );
    }
    if (lib.Error !== null) {
        return (
            <div className="p-6 text-destructive">
                Failed to open step library: {lib.Error}
            </div>
        );
    }

    const selectedCount = selected.size;

    return (
        <div className="flex h-full min-h-[600px] w-full flex-col gap-4 p-6">
            <Toaster />

            {/* ---------- Toolbar ---------- */}
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <FolderTree className="h-5 w-5 text-primary" />
                    <h1 className="text-xl font-semibold tracking-tight">
                        Step Group Library
                    </h1>
                    {lib.Project !== null && (
                        <span className="text-sm text-muted-foreground">
                            · {lib.Project.Name}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                        <Switch
                            checked={showArchived}
                            onCheckedChange={setShowArchived}
                            aria-label="Show archived groups"
                        />
                        Show archived
                    </label>
                    <Separator orientation="vertical" className="h-6" />
                    <span className="text-sm text-muted-foreground">
                        {selectedCount} selected
                    </span>
                    {selectedCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={clearSelection}>
                            Clear
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreateDialog({ open: true, parent: null, name: "" })}
                    >
                        <Plus className="mr-1 h-4 w-4" />
                        New group
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleImportClick}
                    >
                        <Upload className="mr-1 h-4 w-4" />
                        Import ZIP
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInputSourceOpen(true)}
                        title="Configure run-time input source"
                    >
                        <Globe className="mr-1 h-4 w-4" />
                        Input source
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWebhookOpen(true)}
                        title="Configure result webhook"
                    >
                        <Webhook className="mr-1 h-4 w-4" />
                        Webhook
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={selectedCount === 0}
                        onClick={() => setBatchOpen(true)}
                    >
                        <Play className="mr-1 h-4 w-4" />
                        Run selected
                    </Button>
                    <Button
                        size="sm"
                        disabled={selectedCount === 0}
                        onClick={() => handleExport()}
                    >
                        <Download className="mr-1 h-4 w-4" />
                        Export selected
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip,application/zip"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file !== undefined) {
                                handleImportFile(file);
                                e.target.value = "";
                            }
                        }}
                    />
                </div>
            </header>

            <Separator />

            <BundleExchangePanel
                selectedCount={selectedCount}
                onExport={() => handleExport()}
                onImportFile={handleImportFile}
                lastExport={lastExport}
                lastImport={lastImport}
                disabled={lib.Lib === null || lib.Project === null || lib.SqlJs === null}
            />

            {/* ---------- Two-pane body ---------- */}
            <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
                {/* ---- Left: tree ---- */}
                <Card className="flex min-h-[400px] flex-col overflow-hidden">
                    <div className="border-b px-4 py-2 text-sm font-medium text-muted-foreground">
                        Groups
                    </div>
                    <ScrollArea className="flex-1">
                        {tree.length === 0 ? (
                            <EmptyTreeState
                                onCreate={() => setCreateDialog({ open: true, parent: null, name: "" })}
                            />
                        ) : (
                            <ul className="py-2">
                                {tree.map((node, idx) => (
                                    <TreeNodeRow
                                        key={node.Group.StepGroupId}
                                        node={node}
                                        depth={0}
                                        siblingIndex={idx}
                                        siblingCount={tree.length}
                                        selected={selected}
                                        expanded={expanded}
                                        activeGroupId={activeGroupId}
                                        hoveredId={hoveredId}
                                        onHover={setHoveredId}
                                        onToggleSelect={toggleOne}
                                        onToggleSubtree={toggleSubtree}
                                        onToggleExpanded={toggleExpanded}
                                        onActivate={setActiveGroupId}
                                        onCreateChild={(parentId) =>
                                            setCreateDialog({ open: true, parent: parentId, name: "" })
                                        }
                                        onRename={(g) =>
                                            setRenameDialog({ open: true, group: g, name: g.Name })
                                        }
                                        onDelete={(g) =>
                                            setDeleteDialog({ open: true, group: g })
                                        }
                                        onExportThis={(id) => handleExport([id])}
                                        onMove={handleMove}
                                        onArchiveToggle={handleArchiveToggle}
                                        onApplyInputs={(g) => setInputsDialog({ open: true, group: g })}
                                        onImportCsvInputs={(g) => setCsvDialog({ open: true, group: g })}
                                        hasInputs={(gid) => lib.GroupInputs.has(gid)}
                                        onDropReorder={handleDropReorder}
                                    />
                                ))}
                            </ul>
                        )}
                    </ScrollArea>
                </Card>

                {/* ---- Right: step preview ---- */}
                <Card className="flex min-h-[400px] flex-col overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm font-medium text-muted-foreground">
                                {activeGroup === null
                                    ? "Select a group to preview its steps"
                                    : `${activeGroup.Name} — ${activeSteps.length} step(s)`}
                            </div>
                            {activeGroup !== null && lib.GroupInputs.has(activeGroup.StepGroupId) && (
                                <span
                                    className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                                    title={`${Object.keys(lib.GroupInputs.get(activeGroup.StepGroupId) ?? {}).length} input variable(s) bound`}
                                >
                                    Inputs bound
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {activeGroup?.Description != null && activeGroup.Description !== "" && (
                                <div className="hidden max-w-[40ch] truncate text-xs text-muted-foreground sm:block">
                                    {activeGroup.Description}
                                </div>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={activeGroup === null}
                                onClick={() => activeGroup !== null && setInputsDialog({ open: true, group: activeGroup })}
                                title={activeGroup === null ? "Select a group first" : "Apply input data to this group"}
                            >
                                <FileJson className="mr-1 h-4 w-4" />
                                JSON
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={activeGroup === null}
                                onClick={() => activeGroup !== null && setCsvDialog({ open: true, group: activeGroup })}
                                title={activeGroup === null ? "Select a group first" : "Import CSV input for this group"}
                            >
                                <FileSpreadsheet className="mr-1 h-4 w-4" />
                                CSV
                            </Button>
                        </div>
                    </div>
                    <ScrollArea className="flex-1">
                        {activeGroup === null ? (
                            <div className="flex h-full items-center justify-center px-4 py-12 text-sm text-muted-foreground">
                                Click a group on the left to see its steps.
                            </div>
                        ) : activeSteps.length === 0 ? (
                            <div className="flex h-full items-center justify-center px-4 py-12 text-sm text-muted-foreground">
                                This group has no steps yet.
                            </div>
                        ) : (
                            <ol className="divide-y">
                                {activeSteps.map((s, idx) => {
                                    const wait = stepWaits.get(s.StepId);
                                    return (
                                    <li key={s.StepId} className="flex items-start gap-3 px-4 py-3">
                                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                                            {idx + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                                    {stepKindLabel(s.StepKindId)}
                                                </span>
                                                <span className="truncate text-sm font-medium">
                                                    {s.Label ?? "(no label)"}
                                                </span>
                                                {wait !== undefined && (
                                                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400" title={`Wait for ${wait.Kind} "${wait.Selector}" to ${wait.Condition} (${wait.TimeoutMs} ms)`}>
                                                        Wait · {wait.Condition}
                                                    </span>
                                                )}
                                            </div>
                                            {s.StepKindId === StepKindId.RunGroup && s.TargetStepGroupId !== null && (
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Invokes group #{s.TargetStepGroupId}
                                                </p>
                                            )}
                                            {s.PayloadJson !== null && s.PayloadJson !== "" && (
                                                <pre className="mt-1 overflow-x-auto rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                                                    {s.PayloadJson}
                                                </pre>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 shrink-0"
                                            onClick={() => setWaitDialog({ open: true, stepId: s.StepId, stepLabel: s.Label })}
                                            title={wait === undefined ? "Add wait condition" : "Edit wait condition"}
                                        >
                                            <Timer className="h-4 w-4" />
                                        </Button>
                                    </li>
                                    );
                                })}
                            </ol>
                        )}
                    </ScrollArea>
                </Card>
            </div>

            {/* ---------- Create dialog ---------- */}
            <Dialog
                open={createDialog.open}
                onOpenChange={(open) => setCreateDialog((p) => ({ ...p, open }))}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {createDialog.parent === null
                                ? "Create top-level group"
                                : "Create child group"}
                        </DialogTitle>
                        <DialogDescription>
                            Groups bundle related steps and can nest up to 8 levels deep.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="new-group-name">Name</Label>
                        <Input
                            id="new-group-name"
                            value={createDialog.name}
                            maxLength={120}
                            placeholder="e.g. Checkout flow"
                            onChange={(e) => setCreateDialog((p) => ({ ...p, name: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setCreateDialog({ open: false, parent: null, name: "" })}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleCreate}>
                            <FilePlus2 className="mr-1 h-4 w-4" /> Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ---------- Rename dialog ---------- */}
            <Dialog
                open={renameDialog.open}
                onOpenChange={(open) => setRenameDialog((p) => ({ ...p, open }))}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename group</DialogTitle>
                        <DialogDescription>
                            Sibling group names must be unique within the same parent.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="rename-group-name">New name</Label>
                        <Input
                            id="rename-group-name"
                            value={renameDialog.name}
                            maxLength={120}
                            onChange={(e) => setRenameDialog((p) => ({ ...p, name: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setRenameDialog({ open: false, group: null, name: "" })}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleRename}>Rename</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ---------- Delete confirmation ---------- */}
            <AlertDialog
                open={deleteDialog.open}
                onOpenChange={(open) => setDeleteDialog((p) => ({ ...p, open }))}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete “{deleteDialog.group?.Name}”?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the group and every nested
                            group + step inside it. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <BatchRunDialog
                open={batchOpen}
                onOpenChange={setBatchOpen}
                db={lib.Lib}
                projectId={lib.Project?.ProjectId ?? null}
                initialOrder={selectionOrder}
                groupsById={groupsById}
                groupInputs={lib.GroupInputs}
                onApplyMergedInput={(gid, bag) => lib.setGroupInput(gid, bag)}
            />

            <WebhookSettingsDialog
                open={webhookOpen}
                onOpenChange={setWebhookOpen}
            />

            <InputSourceDialog
                open={inputSourceOpen}
                onOpenChange={setInputSourceOpen}
            />

            <StepWaitDialog
                open={waitDialog.open}
                onOpenChange={(o) => setWaitDialog((p) => ({ ...p, open: o }))}
                stepId={waitDialog.stepId}
                stepLabel={waitDialog.stepLabel}
                onChange={refreshStepWaits}
            />

            <ImportErrorDialog
                open={importError.open}
                onOpenChange={(o) => setImportError((p) => ({ ...p, open: o }))}
                explanation={importError.explanation}
                fileName={importError.fileName}
            />

            <GroupInputsDialog
                open={inputsDialog.open}
                groupName={inputsDialog.group?.Name ?? null}
                groupId={inputsDialog.group?.StepGroupId ?? null}
                currentBag={inputsDialog.group === null
                    ? null
                    : (lib.GroupInputs.get(inputsDialog.group.StepGroupId) ?? null)}
                onOpenChange={(o) => setInputsDialog((p) => ({ ...p, open: o }))}
                onApply={(gid, bag) => lib.setGroupInput(gid, bag)}
                onClear={(gid) => lib.clearGroupInput(gid)}
            />

            <CsvInputDialog
                open={csvDialog.open}
                groupName={csvDialog.group?.Name ?? null}
                groupId={csvDialog.group?.StepGroupId ?? null}
                onOpenChange={(o) => setCsvDialog((p) => ({ ...p, open: o }))}
                onApply={(gid, bag) => lib.setGroupInput(gid, bag)}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Tree row                                                           */
/* ------------------------------------------------------------------ */

interface TreeNodeRowProps {
    readonly node: TreeNode;
    readonly depth: number;
    readonly siblingIndex: number;
    readonly siblingCount: number;
    readonly selected: ReadonlySet<number>;
    readonly expanded: ReadonlySet<number>;
    readonly activeGroupId: number | null;
    readonly hoveredId: number | null;
    readonly onHover: (id: number | null) => void;
    readonly onToggleSelect: (id: number, on: boolean) => void;
    readonly onToggleSubtree: (node: TreeNode, on: boolean) => void;
    readonly onToggleExpanded: (id: number) => void;
    readonly onActivate: (id: number) => void;
    readonly onCreateChild: (parentId: number) => void;
    readonly onRename: (g: StepGroupRow) => void;
    readonly onDelete: (g: StepGroupRow) => void;
    readonly onExportThis: (id: number) => void;
    readonly onMove: (id: number, direction: "up" | "down") => void;
    readonly onArchiveToggle: (g: StepGroupRow) => void;
    readonly onApplyInputs: (g: StepGroupRow) => void;
    readonly onImportCsvInputs: (g: StepGroupRow) => void;
    readonly hasInputs: (id: number) => boolean;
    readonly onDropReorder: (parentId: number | null, sourceId: number, targetId: number) => void;
}

const DRAG_MIME = "application/x-marco-step-group";

function TreeNodeRow(props: TreeNodeRowProps) {
    const {
        node, depth, siblingIndex, siblingCount,
        selected, expanded, activeGroupId, hoveredId, onHover,
        onToggleSelect, onToggleSubtree, onToggleExpanded,
        onActivate, onCreateChild, onRename, onDelete, onExportThis,
        onMove, onArchiveToggle, onApplyInputs, onImportCsvInputs, hasInputs, onDropReorder,
    } = props;
    const id = node.Group.StepGroupId;
    const parentId = node.Group.ParentStepGroupId ?? null;
    const hasChildren = node.Children.length > 0;
    const isOpen = expanded.has(id);
    const isActive = activeGroupId === id;
    const isChecked = selected.has(id);
    const isArchived = node.Group.IsArchived;
    const isFirst = siblingIndex === 0;
    const isLast  = siblingIndex === siblingCount - 1;
    // Only the *exact* (innermost) row under the cursor lights up.
    // Ancestor rows whose `<li>` wraps the hovered child stay neutral.
    const isHovered = hoveredId === id;

    const [dragOver, setDragOver] = useState(false);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        // Encode source id + parent so the drop target can validate
        // sibling-only reorder without poking React state.
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ id, parentId }));
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        // Only accept drops from siblings of the SAME parent.
        const types = Array.from(e.dataTransfer.types);
        if (!types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!dragOver) setDragOver(true);
    };

    const handleDragLeave = () => {
        if (dragOver) setDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        const raw = e.dataTransfer.getData(DRAG_MIME);
        if (raw === "") return;
        try {
            const payload = JSON.parse(raw) as { id: number; parentId: number | null };
            if (payload.parentId !== parentId) {
                // Cross-parent drag — ignored intentionally; see handleDropReorder doc.
                return;
            }
            if (payload.id === id) return;
            onDropReorder(parentId, payload.id, id);
        } catch {
            /* malformed payload — ignore */
        }
    };

    return (
        <li>
            <div
                draggable
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onMouseEnter={(e) => {
                    // stopPropagation keeps ancestor rows from re-claiming
                    // hover when the cursor moves inside one of their
                    // descendant rows — guarantees "exact" highlight.
                    e.stopPropagation();
                    onHover(id);
                }}
                onMouseLeave={(e) => {
                    e.stopPropagation();
                    // Only clear if we are still the active hover target.
                    // A racing enter on a sibling may have already moved
                    // the highlight elsewhere — don't clobber it.
                    if (hoveredId === id) onHover(null);
                }}
                data-hovered={isHovered ? "true" : undefined}
                className={[
                    "group relative flex items-center gap-1 rounded px-2 py-1.5 text-sm transition-colors",
                    isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/40",
                    isHovered && !isActive ? "bg-accent/60 ring-1 ring-primary/50 shadow-sm" : "",
                    isHovered && isActive ? "ring-1 ring-primary/70 shadow-sm" : "",
                    isArchived ? "opacity-50" : "",
                    dragOver ? "ring-2 ring-primary/60" : "",
                ].join(" ")}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
                {/* Left accent bar — appears only on the exact hovered row. */}
                {isHovered && (
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-1 left-0 w-1 rounded-r bg-primary"
                    />
                )}
                <GripVertical
                    className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/40 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
                    aria-hidden="true"
                />
                {hasChildren ? (
                    <button
                        type="button"
                        onClick={() => onToggleExpanded(id)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                ) : (
                    <span className="h-5 w-5 shrink-0" />
                )}
                <Checkbox
                    checked={isChecked}
                    onCheckedChange={(v) => onToggleSelect(id, v === true)}
                    aria-label={`Select ${node.Group.Name}`}
                    className="shrink-0"
                />
                <button
                    type="button"
                    onClick={() => onActivate(id)}
                    className="min-w-0 flex-1 truncate text-left"
                    title={node.Group.Name}
                >
                    {node.Group.Name}
                    {hasInputs(id) && (
                        <span
                            className="ml-2 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                            title="This group has input data bound"
                        >
                            <FileJson className="h-2.5 w-2.5" /> Inputs
                        </span>
                    )}
                    {isArchived && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Archived
                        </span>
                    )}
                </button>

                {/* Up / Down arrows — visible on hover, disabled at edges. */}
                <div className="flex items-center opacity-0 group-hover:opacity-100">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={isFirst}
                        onClick={() => onMove(id, "up")}
                        aria-label={`Move ${node.Group.Name} up`}
                    >
                        <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={isLast}
                        onClick={() => onMove(id, "down")}
                        aria-label={`Move ${node.Group.Name} down`}
                    >
                        <ChevronDownIcon className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                            aria-label={`Actions for ${node.Group.Name}`}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onSelect={() => onCreateChild(id)}>
                            <Plus className="mr-2 h-4 w-4" /> New child group
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onRename(node.Group)}>
                            <Pencil className="mr-2 h-4 w-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onMove(id, "up")} disabled={isFirst}>
                            <ChevronUp className="mr-2 h-4 w-4" /> Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onMove(id, "down")} disabled={isLast}>
                            <ChevronDownIcon className="mr-2 h-4 w-4" /> Move down
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onToggleSubtree(node, true)}>
                            Select with descendants
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onToggleSubtree(node, false)}>
                            Deselect with descendants
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onExportThis(id)}>
                            <Download className="mr-2 h-4 w-4" /> Export this group
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onApplyInputs(node.Group)}>
                            <FileJson className="mr-2 h-4 w-4" />
                            {hasInputs(id) ? "Edit input data…" : "Apply input data…"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onImportCsvInputs(node.Group)}>
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Import from CSV…
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onArchiveToggle(node.Group)}>
                            {isArchived ? (
                                <><ArchiveRestore className="mr-2 h-4 w-4" /> Restore from archive</>
                            ) : (
                                <><Archive className="mr-2 h-4 w-4" /> Archive</>
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => onDelete(node.Group)}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {hasChildren && isOpen && (
                <ul>
                    {node.Children.map((child, idx) => (
                        <TreeNodeRow
                            key={child.Group.StepGroupId}
                            {...props}
                            node={child}
                            depth={depth + 1}
                            siblingIndex={idx}
                            siblingCount={node.Children.length}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

function EmptyTreeState({ onCreate }: { onCreate: () => void }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-12 text-center text-sm text-muted-foreground">
            <FolderTree className="h-10 w-10 text-muted-foreground/50" />
            <p>No step groups yet.</p>
            <Button variant="outline" size="sm" onClick={onCreate}>
                <Plus className="mr-1 h-4 w-4" /> Create your first group
            </Button>
        </div>
    );
}
