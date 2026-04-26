/**
 * Marco Extension — Step Group List Panel
 *
 * Flat-list browser for every StepGroup in the current project, with a
 * search field on the left and a read-only details panel on the right.
 *
 * This is intentionally a *simpler* surface than `StepGroupLibraryPanel`
 * (which exposes the hierarchical tree, multi-select, drag-reorder,
 * archive, import/export and CRUD). The list view is for the common
 * case: "I just want to find a group by name and look at what's
 * inside." It uses the same `useStepLibrary` data layer so any change
 * made here is immediately reflected in the tree view, and vice versa.
 *
 * Layout:
 *   ┌─────────────────────────── Header ───────────────────────────┐
 *   │  Project · group count · "Open tree view" link               │
 *   ├──────────── Search ──────────────────────────────────────────┤
 *   ├────────────────┬─────────────────────────────────────────────┤
 *   │  Group list    │  Details                                    │
 *   │  (filtered,    │  ┌─ Metadata ──────────────────────────┐    │
 *   │   single-      │  └─────────────────────────────────────┘    │
 *   │   select)      │  ┌─ Steps ─────────────────────────────┐    │
 *   │                │  └─────────────────────────────────────┘    │
 *   └────────────────┴─────────────────────────────────────────────┘
 *
 * Filter rules:
 *   - Case-insensitive substring match on Name OR Description.
 *   - Empty query shows everything (incl. archived, since archive is a
 *     full-fledged feature in the tree view but a read-only badge here).
 *   - Result count surfaced in the header so an empty list is never a
 *     surprise.
 *
 * @see ./StepGroupLibraryPanel.tsx — the richer tree-view sibling.
 * @see @/hooks/use-step-library — shared data source.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, FolderTree, ListOrdered, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { stepKindLabel, useStepLibrary } from "@/hooks/use-step-library";
import type { StepGroupRow, StepRow } from "@/background/recorder/step-library/db";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>
                        {filtered.length} of {lib.Groups.length} group(s)
                    </span>
                    <Link
                        to="/step-groups"
                        className="text-primary underline-offset-2 hover:underline"
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
                            <div className="flex h-full items-center justify-center px-4 py-12 text-center text-sm text-muted-foreground">
                                {lib.Groups.length === 0
                                    ? "This project has no step groups yet."
                                    : `No groups match “${query}”.`}
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
                            <header className="flex flex-col gap-1 border-b px-4 py-3">
                                <div className="flex items-center gap-2">
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
        </div>
    );
}

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
