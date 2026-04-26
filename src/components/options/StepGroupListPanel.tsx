/**
 * Marco Extension — Step Group List Panel
 *
 * Flat-list browser for every StepGroup in the current project, with a
 * search field on the left and a details panel on the right.
 *
 * In addition to read-only browsing this panel exposes the three core
 * mutations directly on its toolbar / details header:
 *
 *   - **Create** — new top-level group, opens a Dialog with live
 *     inline validation (required, ≤ 120 chars, unique among root
 *     siblings — case-insensitive).
 *   - **Rename** — opens a Dialog seeded with the current name. Same
 *     validation, plus an "unchanged" guard so the OK button stays
 *     disabled until a real change is made.
 *   - **Delete** — opens a destructive AlertDialog that spells out
 *     the cascading effect (every nested group + step is removed).
 *
 * All three confirm dialogs validate **on every keystroke**, surface
 * the rule that's failing in red text under the input, and disable
 * the primary action button until validation passes — so the user
 * never has to submit-and-recover from a server-side error.
 *
 * Shares the `useStepLibrary` data layer with `StepGroupLibraryPanel`,
 * so any change here is immediately reflected in the tree view.
 *
 * @see ./StepGroupLibraryPanel.tsx — the richer tree-view sibling.
 * @see @/hooks/use-step-library — shared data source.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    Archive,
    Download,
    FilePlus2,
    FolderTree,
    ListOrdered,
    Pencil,
    Plus,
    Search,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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

import { stepKindLabel, useStepLibrary } from "@/hooks/use-step-library";
import type { StepGroupRow, StepRow } from "@/background/recorder/step-library/db";

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Maximum length matches the `maxLength` enforced on the existing tree
 * view's create/rename inputs (`StepGroupLibraryPanel`). Keeping them
 * aligned avoids one panel accepting names the other rejects.
 */
const NAME_MAX_LEN = 120;

/**
 * Pure validator — always returns either `null` (valid) or a short,
 * user-facing message safe to render under the input. Kept outside the
 * component so it can be unit-tested without React.
 *
 * @param raw          - the raw input value (NOT trimmed)
 * @param siblingNames - existing names of every sibling under the
 *                       intended parent. For rename, the current name
 *                       must be EXCLUDED by the caller so renaming to
 *                       the same value isn't reported as a clash.
 */
function validateName(raw: string, siblingNames: ReadonlyArray<string>): string | null {
    const trimmed = raw.trim();
    if (trimmed === "") return "Name is required.";
    if (trimmed.length > NAME_MAX_LEN) {
        return `Name must be ${NAME_MAX_LEN} characters or fewer.`;
    }
    const lower = trimmed.toLowerCase();
    const clash = siblingNames.find((s) => s.toLowerCase() === lower);
    if (clash !== undefined) return "Another group at this level already has that name.";
    return null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Session-scoped handoff key. When the user clicks "Export selected"
 * here, we stash the chosen StepGroupIds and navigate to the tree
 * view, which owns the full export pipeline (preview + error dialog
 * + last-export summary). The tree panel reads + clears this key on
 * mount and pre-populates its selection set.
 *
 * Using sessionStorage (not a route-state object) keeps the handoff
 * resilient to manual reloads / direct URL navigation between the
 * two panels.
 */
export const STEP_GROUP_PRESELECT_KEY = "stepGroupListPreselect";

function matchesQuery(group: StepGroupRow, query: string): boolean {
    if (query === "") return true;
    const q = query.toLowerCase();
    if (group.Name.toLowerCase().includes(q)) return true;
    const desc = group.Description ?? "";
    if (desc !== "" && desc.toLowerCase().includes(q)) return true;
    return false;
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StepGroupListPanel() {
    const lib = useStepLibrary();
    const [query, setQuery] = useState("");
    const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

    /**
     * Dialog state. We keep `name` on the dialog itself so the input
     * is fully controlled and the validator can run on every keystroke
     * without bouncing through the parent.
     */
    const [createDialog, setCreateDialog] = useState<{ open: boolean; name: string }>({
        open: false,
        name: "",
    });
    const [renameDialog, setRenameDialog] = useState<{
        open: boolean;
        group: StepGroupRow | null;
        name: string;
    }>({ open: false, group: null, name: "" });
    const [deleteDialog, setDeleteDialog] = useState<{
        open: boolean;
        group: StepGroupRow | null;
    }>({ open: false, group: null });

    /**
     * Build a parent-name lookup once per Groups change so each row can
     * cheaply show "Parent / Name" without walking the tree on render.
     */
    const groupsById = useMemo(() => {
        const m = new Map<number, StepGroupRow>();
        for (const g of lib.Groups) m.set(g.StepGroupId, g);
        return m;
    }, [lib.Groups]);

    const sortedGroups = useMemo(() => {
        return lib.Groups.slice().sort((a, b) => a.Name.localeCompare(b.Name));
    }, [lib.Groups]);

    const filtered = useMemo(() => {
        return sortedGroups.filter((g) => matchesQuery(g, query.trim()));
    }, [sortedGroups, query]);

    const activeGroup = useMemo(
        () => (activeGroupId === null ? null : (groupsById.get(activeGroupId) ?? null)),
        [activeGroupId, groupsById],
    );
    const activeSteps: ReadonlyArray<StepRow> =
        activeGroupId === null ? [] : (lib.StepsByGroup.get(activeGroupId) ?? []);

    /* ------------------------ Sibling lookups --------------------- */

    /**
     * Names of root-level siblings (where new top-level groups land).
     * Used to validate the Create dialog.
     */
    const rootSiblingNames = useMemo(() => {
        return lib.Groups
            .filter((g) => g.ParentStepGroupId === null)
            .map((g) => g.Name);
    }, [lib.Groups]);

    /**
     * Names of siblings under the same parent as `renameDialog.group`,
     * EXCLUDING the group being renamed so its current name doesn't
     * count as a clash with itself.
     */
    const renameSiblingNames = useMemo(() => {
        const target = renameDialog.group;
        if (target === null) return [] as string[];
        const parentId = target.ParentStepGroupId ?? null;
        return lib.Groups
            .filter(
                (g) =>
                    (g.ParentStepGroupId ?? null) === parentId &&
                    g.StepGroupId !== target.StepGroupId,
            )
            .map((g) => g.Name);
    }, [lib.Groups, renameDialog.group]);

    /* ------------------------ Live validation --------------------- */

    const createError = useMemo(
        () => validateName(createDialog.name, rootSiblingNames),
        [createDialog.name, rootSiblingNames],
    );
    const renameError = useMemo(() => {
        if (renameDialog.group === null) return null;
        const baseError = validateName(renameDialog.name, renameSiblingNames);
        if (baseError !== null) return baseError;
        // Soft "unchanged" guard — not a real error but keeps the
        // primary action disabled until the user actually types.
        if (renameDialog.name.trim() === renameDialog.group.Name) {
            return "Type a different name to rename.";
        }
        return null;
    }, [renameDialog.name, renameDialog.group, renameSiblingNames]);

    /* ------------------------ Handlers ---------------------------- */

    const openCreate = () => setCreateDialog({ open: true, name: "" });
    const openRename = (g: StepGroupRow) =>
        setRenameDialog({ open: true, group: g, name: g.Name });
    const openDelete = (g: StepGroupRow) => setDeleteDialog({ open: true, group: g });

    const submitCreate = () => {
        if (createError !== null) return; // double-guard: button is also disabled
        const name = createDialog.name.trim();
        try {
            const newId = lib.createGroup({ Name: name, ParentStepGroupId: null });
            setCreateDialog({ open: false, name: "" });
            setActiveGroupId(newId);
            toast.success(`Created “${name}”`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Create failed");
        }
    };

    const submitRename = () => {
        if (renameError !== null || renameDialog.group === null) return;
        const name = renameDialog.name.trim();
        try {
            lib.renameGroup(renameDialog.group.StepGroupId, name);
            toast.success(`Renamed to “${name}”`);
            setRenameDialog({ open: false, group: null, name: "" });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Rename failed");
        }
    };

    const submitDelete = () => {
        if (deleteDialog.group === null) return;
        const id = deleteDialog.group.StepGroupId;
        const name = deleteDialog.group.Name;
        try {
            lib.deleteGroup(id);
            if (activeGroupId === id) setActiveGroupId(null);
            toast.success(`Deleted “${name}”`);
            setDeleteDialog({ open: false, group: null });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Delete failed");
        }
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

    return (
        <div className="flex h-full min-h-[600px] w-full flex-col gap-4 p-6">
            <Toaster />

            {/* ---------- Header ---------- */}
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <FolderTree className="h-5 w-5 text-primary" />
                    <h1 className="text-xl font-semibold tracking-tight">
                        Step Group Library — List
                    </h1>
                    {lib.Project !== null && (
                        <span className="text-sm text-muted-foreground">
                            · {lib.Project.Name}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                        {filtered.length} of {lib.Groups.length} group(s)
                    </span>
                    <Button size="sm" onClick={openCreate}>
                        <Plus className="mr-1 h-4 w-4" />
                        New group
                    </Button>
                    <Link
                        to="/step-groups"
                        className="text-sm text-primary underline-offset-2 hover:underline"
                        title="Switch to the hierarchical tree browser"
                    >
                        Open tree view
                    </Link>
                </div>
            </header>

            {/* ---------- Search ---------- */}
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or description…"
                    className="pl-9"
                    aria-label="Search step groups"
                />
            </div>

            <Separator />

            {/* ---------- Two-pane body ---------- */}
            <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
                {/* ---- Left: list ---- */}
                <Card className="flex min-h-[400px] flex-col overflow-hidden">
                    <div className="border-b px-4 py-2 text-sm font-medium text-muted-foreground">
                        Groups
                    </div>
                    <ScrollArea className="flex-1">
                        {filtered.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
                                {lib.Groups.length === 0 ? (
                                    <>
                                        <span>This project has no step groups yet.</span>
                                        <Button size="sm" variant="outline" onClick={openCreate}>
                                            <FilePlus2 className="mr-1 h-4 w-4" />
                                            Create the first one
                                        </Button>
                                    </>
                                ) : (
                                    <span>No groups match "{query}".</span>
                                )}
                            </div>
                        ) : (
                            <ul className="divide-y">
                                {filtered.map((g) => {
                                    const isActive = g.StepGroupId === activeGroupId;
                                    const stepCount =
                                        lib.StepsByGroup.get(g.StepGroupId)?.length ?? 0;
                                    const parent =
                                        g.ParentStepGroupId === null
                                            ? null
                                            : (groupsById.get(g.ParentStepGroupId) ?? null);
                                    return (
                                        <li key={g.StepGroupId}>
                                            <button
                                                type="button"
                                                onClick={() => setActiveGroupId(g.StepGroupId)}
                                                className={[
                                                    "flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition",
                                                    isActive
                                                        ? "bg-primary/10 text-foreground"
                                                        : "hover:bg-muted/40",
                                                ].join(" ")}
                                                aria-pressed={isActive}
                                            >
                                                <div className="flex w-full items-center gap-2">
                                                    <span className="truncate text-sm font-medium">
                                                        {g.Name}
                                                    </span>
                                                    {g.IsArchived && (
                                                        <span
                                                            className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                                            title="Archived"
                                                        >
                                                            <Archive className="h-3 w-3" />
                                                            Archived
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                                                    <ListOrdered className="h-3 w-3" />
                                                    <span>
                                                        {stepCount} step{stepCount === 1 ? "" : "s"}
                                                    </span>
                                                    {parent !== null && (
                                                        <span className="truncate">
                                                            · in {parent.Name}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </ScrollArea>
                </Card>

                {/* ---- Right: details ---- */}
                <Card className="flex min-h-[400px] flex-col overflow-hidden">
                    {activeGroup === null ? (
                        <div className="flex h-full items-center justify-center px-4 py-12 text-sm text-muted-foreground">
                            Select a group on the left to see its details.
                        </div>
                    ) : (
                        <>
                            <header className="flex flex-col gap-2 border-b px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <h2 className="truncate text-base font-semibold">
                                            {activeGroup.Name}
                                        </h2>
                                        {activeGroup.IsArchived && (
                                            <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                <Archive className="h-3 w-3" />
                                                Archived
                                            </span>
                                        )}
                                        {lib.GroupInputs.has(activeGroup.StepGroupId) && (
                                            <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                                                Inputs bound
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openRename(activeGroup)}
                                        >
                                            <Pencil className="mr-1 h-4 w-4" />
                                            Rename
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => openDelete(activeGroup)}
                                        >
                                            <Trash2 className="mr-1 h-4 w-4" />
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                                {activeGroup.Description != null &&
                                    activeGroup.Description !== "" && (
                                        <p className="text-sm text-muted-foreground">
                                            {activeGroup.Description}
                                        </p>
                                    )}
                            </header>

                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b bg-muted/20 px-4 py-2 text-xs">
                                <DetailField label="ID" value={`#${activeGroup.StepGroupId}`} mono />
                                <DetailField
                                    label="Steps"
                                    value={String(activeSteps.length)}
                                />
                                <DetailField
                                    label="Created"
                                    value={formatDate(activeGroup.CreatedAt)}
                                />
                                <DetailField
                                    label="Updated"
                                    value={formatDate(activeGroup.UpdatedAt)}
                                />
                            </div>

                            <ScrollArea className="flex-1">
                                {activeSteps.length === 0 ? (
                                    <div className="flex h-full items-center justify-center px-4 py-12 text-sm text-muted-foreground">
                                        This group has no steps yet.
                                    </div>
                                ) : (
                                    <ol className="divide-y">
                                        {activeSteps.map((s, idx) => (
                                            <li
                                                key={s.StepId}
                                                className="flex items-start gap-3 px-4 py-3"
                                            >
                                                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
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
                                                        {s.IsDisabled && (
                                                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                                Disabled
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </ScrollArea>
                        </>
                    )}
                </Card>
            </div>

            {/* ---------- Create dialog ---------- */}
            <Dialog
                open={createDialog.open}
                onOpenChange={(open) =>
                    setCreateDialog((p) => (open ? { ...p, open: true } : { open: false, name: "" }))
                }
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create top-level group</DialogTitle>
                        <DialogDescription>
                            Groups bundle related steps. The new group will appear at the
                            root of {lib.Project?.Name ?? "this project"}.
                        </DialogDescription>
                    </DialogHeader>
                    <ValidatedNameField
                        id="list-create-group-name"
                        label="Name"
                        value={createDialog.name}
                        error={createError}
                        placeholder="e.g. Checkout flow"
                        onChange={(v) => setCreateDialog((p) => ({ ...p, name: v }))}
                        onSubmit={submitCreate}
                    />
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setCreateDialog({ open: false, name: "" })}
                        >
                            Cancel
                        </Button>
                        <Button onClick={submitCreate} disabled={createError !== null}>
                            <FilePlus2 className="mr-1 h-4 w-4" />
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ---------- Rename dialog ---------- */}
            <Dialog
                open={renameDialog.open}
                onOpenChange={(open) =>
                    setRenameDialog((p) =>
                        open ? { ...p, open: true } : { open: false, group: null, name: "" },
                    )
                }
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename group</DialogTitle>
                        <DialogDescription>
                            Sibling group names must be unique within the same parent.
                        </DialogDescription>
                    </DialogHeader>
                    <ValidatedNameField
                        id="list-rename-group-name"
                        label="New name"
                        value={renameDialog.name}
                        error={renameError}
                        onChange={(v) => setRenameDialog((p) => ({ ...p, name: v }))}
                        onSubmit={submitRename}
                    />
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() =>
                                setRenameDialog({ open: false, group: null, name: "" })
                            }
                        >
                            Cancel
                        </Button>
                        <Button onClick={submitRename} disabled={renameError !== null}>
                            Rename
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ---------- Delete confirmation ---------- */}
            <AlertDialog
                open={deleteDialog.open}
                onOpenChange={(open) =>
                    setDeleteDialog((p) => (open ? { ...p, open: true } : { open: false, group: null }))
                }
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete "{deleteDialog.group?.Name}"?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the group and every nested
                            group + step inside it. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function DetailField(props: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {props.label}
            </span>
            <span className={props.mono === true ? "font-mono text-xs" : "text-xs"}>
                {props.value}
            </span>
        </div>
    );
}

/**
 * Reusable name input that wires together the label, the controlled
 * input, and a live-error region. Accessibility: the error message is
 * linked via `aria-describedby` and `aria-invalid` flips with `error`.
 */
function ValidatedNameField(props: {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly error: string | null;
    readonly placeholder?: string;
    readonly onChange: (value: string) => void;
    readonly onSubmit: () => void;
}) {
    const helpId = `${props.id}-help`;
    const invalid = props.error !== null && props.value !== "";
    return (
        <div className="space-y-2">
            <Label htmlFor={props.id}>{props.label}</Label>
            <Input
                id={props.id}
                value={props.value}
                maxLength={NAME_MAX_LEN}
                placeholder={props.placeholder}
                onChange={(e) => props.onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") props.onSubmit();
                }}
                aria-invalid={invalid}
                aria-describedby={helpId}
                autoFocus
                className={invalid ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            <p
                id={helpId}
                className={`min-h-[1rem] text-xs ${
                    props.error === null ? "text-muted-foreground" : "text-destructive"
                }`}
            >
                {props.error ?? `${props.value.trim().length}/${NAME_MAX_LEN}`}
            </p>
        </div>
    );
}
