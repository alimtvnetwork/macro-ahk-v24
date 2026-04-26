/**
 * Marco Extension — useStepLibrary
 *
 * React hook that owns an in-memory `StepLibraryDb` (sql.js) and
 * persists the raw DB bytes to `localStorage` on every mutation.
 *
 * This is the "preview-friendly" data layer that the new
 * `StepGroupLibraryPanel` uses. It deliberately does NOT touch OPFS,
 * chrome.storage, or the background message bus — those are wired
 * separately when the panel ships inside the extension. Keeping the
 * hook self-contained makes the panel runnable in the Lovable preview
 * and unit-testable without WASM mocking gymnastics.
 *
 * Storage key: `marco.step-library.v1` (versioned so a future schema
 * bump can invalidate cleanly).
 *
 * @see src/background/recorder/step-library/db.ts
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

import {
    StepLibraryDb,
    type ProjectRow,
    type StepGroupRow,
    type StepRow,
} from "@/background/recorder/step-library/db";
import {
    clearGroupInput as clearGroupInputStorage,
    readAllGroupInputs,
    writeGroupInput,
    type GroupInputBag,
    type GroupInputsMap,
} from "@/background/recorder/step-library/group-inputs";
import { StepKindId } from "@/background/recorder/step-library/schema";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "marco.step-library.v1";
const WASM_CDN_URL = "https://sql.js.org/dist/sql-wasm.wasm";
const DEFAULT_PROJECT_NAME = "My Project";
const DEFAULT_PROJECT_EXTERNAL_ID = "00000000-0000-0000-0000-000000000001";

/* ------------------------------------------------------------------ */
/*  sql.js singleton (lazy, browser-only)                              */
/* ------------------------------------------------------------------ */

let sqlPromise: Promise<SqlJsStatic> | null = null;
function loadSql(): Promise<SqlJsStatic> {
    if (sqlPromise === null) {
        sqlPromise = initSqlJs({ locateFile: () => WASM_CDN_URL });
    }
    return sqlPromise;
}

function readBytesFromStorage(): Uint8Array | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return null;
        const arr = JSON.parse(raw) as number[];
        if (!Array.isArray(arr)) return null;
        return new Uint8Array(arr);
    } catch {
        return null;
    }
}

function writeBytesToStorage(bytes: Uint8Array): void {
    try {
        // localStorage only takes strings — JSON-encode as a numeric
        // array. Acceptable for a preview-tier persistence (small DBs);
        // production wiring will flip this over to OPFS.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(bytes)));
    } catch (err) {
        // Quota / private-mode failures should not crash the UI.
        console.warn("useStepLibrary: localStorage write failed", err);
    }
}

/* ------------------------------------------------------------------ */
/*  Public hook surface                                                */
/* ------------------------------------------------------------------ */

export interface UseStepLibraryState {
    readonly Loading: boolean;
    readonly Error: string | null;
    readonly SqlJs: SqlJsStatic | null;
    readonly Lib: StepLibraryDb | null;
    readonly Project: ProjectRow | null;
    readonly Groups: ReadonlyArray<StepGroupRow>;
    readonly StepsByGroup: ReadonlyMap<number, ReadonlyArray<StepRow>>;
    /**
     * Per-StepGroup input variable bags. Empty Map until a user
     * applies one via the GroupInputsDialog. Persisted to a sibling
     * `localStorage` key — see `group-inputs.ts`.
     */
    readonly GroupInputs: GroupInputsMap;
}

export interface UseStepLibraryApi extends UseStepLibraryState {
    /** Force a re-read from the DB — call after a mutation outside CRUD helpers (e.g. import). */
    readonly refresh: () => void;
    readonly createGroup: (input: { Name: string; ParentStepGroupId: number | null; Description?: string | null }) => number;
    readonly renameGroup: (stepGroupId: number, newName: string) => void;
    readonly deleteGroup: (stepGroupId: number) => void;
    /**
     * Move a group up or down among its current siblings (same parent).
     * No-op when the move would push past either edge — the panel can
     * still call it on every arrow-button click without checking.
     */
    readonly moveGroupWithinParent: (stepGroupId: number, direction: "up" | "down") => void;
    /**
     * Reorder all sibling groups under a parent in one shot. Used by
     * the drag-and-drop handler — caller passes the COMPLETE new order.
     */
    readonly reorderSiblings: (parentStepGroupId: number | null, orderedIds: readonly number[]) => void;
    readonly setGroupArchived: (stepGroupId: number, archived: boolean) => void;
    /**
     * Replace the input variable bag for one StepGroup. The bag must
     * be a plain JSON object — see `parseGroupInputJson` in
     * `group-inputs.ts`. Persisted immediately to localStorage.
     */
    readonly setGroupInput: (stepGroupId: number, bag: GroupInputBag) => void;
    /** Remove the input bag for one StepGroup. No-op when absent. */
    readonly clearGroupInput: (stepGroupId: number) => void;
    readonly resetAll: () => void;
}

export function useStepLibrary(): UseStepLibraryApi {
    const [sql, setSql] = useState<SqlJsStatic | null>(null);
    const [lib, setLib] = useState<StepLibraryDb | null>(null);
    const [project, setProject] = useState<ProjectRow | null>(null);
    const [groups, setGroups] = useState<ReadonlyArray<StepGroupRow>>([]);
    const [stepsByGroup, setStepsByGroup] = useState<ReadonlyMap<number, ReadonlyArray<StepRow>>>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [groupInputs, setGroupInputs] = useState<GroupInputsMap>(() => new Map());
    const [loading, setLoading] = useState(true);

    /* ------------------------ bootstrap --------------------------- */

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const sqljs = await loadSql();
                if (cancelled) return;
                const persisted = readBytesFromStorage();
                const db: Database = persisted === null
                    ? new sqljs.Database()
                    : new sqljs.Database(persisted);
                const wrapper = new StepLibraryDb(db);
                let projectId: number;
                const existing = wrapper.listProjects();
                if (existing.length === 0) {
                    projectId = wrapper.upsertProject({
                        ExternalId: DEFAULT_PROJECT_EXTERNAL_ID,
                        Name: DEFAULT_PROJECT_NAME,
                    });
                    seedExampleData(wrapper, projectId);
                    writeBytesToStorage(wrapper.exportDbBytes());
                } else {
                    projectId = existing[0].ProjectId;
                }
                if (cancelled) return;
                setSql(sqljs);
                setLib(wrapper);
                setProject(wrapper.listProjects().find((p) => p.ProjectId === projectId) ?? null);
                refreshFromDb(wrapper, projectId, setGroups, setStepsByGroup);
                setGroupInputs(readAllGroupInputs());
                setLoading(false);
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : "step library failed to load");
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const persist = useCallback(() => {
        if (lib === null) return;
        writeBytesToStorage(lib.exportDbBytes());
    }, [lib]);

    const refresh = useCallback(() => {
        if (lib === null || project === null) return;
        refreshFromDb(lib, project.ProjectId, setGroups, setStepsByGroup);
    }, [lib, project]);

    const createGroup = useCallback<UseStepLibraryApi["createGroup"]>((input) => {
        if (lib === null || project === null) {
            throw new Error("createGroup: library not initialised");
        }
        const id = lib.createGroup({
            ProjectId: project.ProjectId,
            ParentStepGroupId: input.ParentStepGroupId,
            Name: input.Name,
            Description: input.Description ?? null,
        });
        refreshFromDb(lib, project.ProjectId, setGroups, setStepsByGroup);
        persist();
        return id;
    }, [lib, project, persist]);

    const renameGroup = useCallback<UseStepLibraryApi["renameGroup"]>((id, name) => {
        if (lib === null || project === null) return;
        lib.renameGroup(id, name);
        refreshFromDb(lib, project.ProjectId, setGroups, setStepsByGroup);
        persist();
    }, [lib, project, persist]);

    const deleteGroup = useCallback<UseStepLibraryApi["deleteGroup"]>((id) => {
        if (lib === null || project === null) return;
        lib.deleteGroup(id);
        refreshFromDb(lib, project.ProjectId, setGroups, setStepsByGroup);
        persist();
    }, [lib, project, persist]);

    const moveGroupWithinParent = useCallback<UseStepLibraryApi["moveGroupWithinParent"]>((id, direction) => {
        if (lib === null || project === null) return;
        const all = lib.listGroups(project.ProjectId);
        const target = all.find((g) => g.StepGroupId === id);
        if (target === undefined) return;
        const parent = target.ParentStepGroupId ?? null;
        const siblings = all
            .filter((g) => (g.ParentStepGroupId ?? null) === parent)
            .sort((a, b) => a.OrderIndex - b.OrderIndex || a.Name.localeCompare(b.Name))
            .map((g) => g.StepGroupId);
        const idx = siblings.indexOf(id);
        if (idx === -1) return;
        const swapWith = direction === "up" ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= siblings.length) return; // already at edge
        const next = siblings.slice();
        [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
        lib.reorderGroups(project.ProjectId, parent, next);
        refreshFromDb(lib, project.ProjectId, setGroups, setStepsByGroup);
        persist();
    }, [lib, project, persist]);

    const reorderSiblings = useCallback<UseStepLibraryApi["reorderSiblings"]>((parent, orderedIds) => {
        if (lib === null || project === null) return;
        lib.reorderGroups(project.ProjectId, parent, orderedIds);
        refreshFromDb(lib, project.ProjectId, setGroups, setStepsByGroup);
        persist();
    }, [lib, project, persist]);

    const setGroupArchived = useCallback<UseStepLibraryApi["setGroupArchived"]>((id, archived) => {
        if (lib === null || project === null) return;
        lib.setGroupArchived(id, archived);
        refreshFromDb(lib, project.ProjectId, setGroups, setStepsByGroup);
        persist();
    }, [lib, project, persist]);

    const resetAll = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
        // Force a hard reload of the in-memory DB by re-running bootstrap.
        // Easiest path: reload the page fragment owning the hook.
        window.location.reload();
    }, []);

    return useMemo<UseStepLibraryApi>(() => ({
        Loading: loading,
        Error: error,
        SqlJs: sql,
        Lib: lib,
        Project: project,
        Groups: groups,
        StepsByGroup: stepsByGroup,
        refresh,
        createGroup,
        renameGroup,
        deleteGroup,
        moveGroupWithinParent,
        reorderSiblings,
        setGroupArchived,
        resetAll,
    }), [loading, error, sql, lib, project, groups, stepsByGroup, refresh, createGroup, renameGroup, deleteGroup, moveGroupWithinParent, reorderSiblings, setGroupArchived, resetAll]);
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

function refreshFromDb(
    lib: StepLibraryDb,
    projectId: number,
    setGroups: (g: ReadonlyArray<StepGroupRow>) => void,
    setStepsByGroup: (m: ReadonlyMap<number, ReadonlyArray<StepRow>>) => void,
): void {
    const groups = lib.listGroups(projectId);
    setGroups(groups);
    const map = new Map<number, ReadonlyArray<StepRow>>();
    for (const g of groups) {
        map.set(g.StepGroupId, lib.listSteps(g.StepGroupId));
    }
    setStepsByGroup(map);
}

/**
 * Seed a small, illustrative tree on first run so the empty state has
 * something to demonstrate. Safe to remove once the panel is wired to
 * the real recorder data.
 */
function seedExampleData(lib: StepLibraryDb, projectId: number): void {
    const onboarding = lib.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: null,
        Name: "Onboarding",
        Description: "End-to-end signup flow",
    });
    const login = lib.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: onboarding,
        Name: "Login",
        Description: "Sign-in subroutine",
    });
    lib.appendStep({
        StepGroupId: onboarding,
        StepKindId: StepKindId.Click,
        Label: "Click Get Started",
        PayloadJson: JSON.stringify({ Selector: "#get-started" }),
    });
    lib.appendStep({
        StepGroupId: onboarding,
        StepKindId: StepKindId.RunGroup,
        Label: "Run Login subroutine",
        TargetStepGroupId: login,
    });
    lib.appendStep({
        StepGroupId: login,
        StepKindId: StepKindId.Type,
        Label: "Type email",
        PayloadJson: JSON.stringify({ Selector: "#email", Value: "{{Email}}" }),
    });
    lib.appendStep({
        StepGroupId: login,
        StepKindId: StepKindId.Click,
        Label: "Click Sign in",
        PayloadJson: JSON.stringify({ Selector: "#signin" }),
    });
    lib.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: null,
        Name: "Checkout",
        Description: "Cart + payment macros",
    });
}

/** StepKind id → human label, for the right-pane preview. */
export function stepKindLabel(id: StepKindId): string {
    switch (id) {
        case StepKindId.Click:    return "Click";
        case StepKindId.Type:     return "Type";
        case StepKindId.Select:   return "Select";
        case StepKindId.JsInline: return "JS";
        case StepKindId.Wait:     return "Wait";
        case StepKindId.RunGroup: return "Run group";
        default:                  return `Kind ${String(id)}`;
    }
}
