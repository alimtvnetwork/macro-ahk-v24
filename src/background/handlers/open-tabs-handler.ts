/**
 * Open Lovable Tabs Handler
 *
 * Returns the list of currently open Chrome tabs whose URL matches the
 * Lovable platform patterns (lovable.dev / *.lovable.app), enriched with
 * each tab's bound project — derived from the in-memory tabInjections
 * map maintained by state-manager.
 *
 * Consumed by the macro-controller's "Open Lovable Tabs" panel, which
 * cannot call chrome.tabs directly from the MAIN world
 * (mem://architecture/injection-context-awareness).
 */

import { STORAGE_KEY_ALL_PROJECTS } from "../../shared/constants";
import type { StoredProject } from "../../shared/project-types";
import { getTabInjections } from "../state-manager";

export interface OpenLovableTabInfo {
    /** Chrome tab id; null if Chrome did not assign one. */
    tabId: number | null;
    title: string;
    url: string;
    /** Whether the tab is the active tab in its window. */
    active: boolean;
    /** Whether the tab is the focused window. */
    windowFocused: boolean;
    /** Bound project id, or null when no injection has been recorded yet. */
    projectId: string | null;
    /** Resolved project name, or null when no binding could be matched. */
    projectName: string | null;
    /** Path used to bind: "injection" (live record) or "none". */
    bindingSource: "injection" | "none";
}

export interface OpenLovableTabsResponse {
    tabs: OpenLovableTabInfo[];
    capturedAt: string;
}

/** URL match patterns for chrome.tabs.query — must mirror auto-injector / cookie-watcher. */
const LOVABLE_TAB_PATTERNS: string[] = [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*",
    "https://lovable.app/*",
    "https://*.lovable.app/*",
];

export async function handleGetOpenLovableTabs(): Promise<OpenLovableTabsResponse> {
    const [tabs, projectsResult, focusedWindow] = await Promise.all([
        chrome.tabs.query({ url: LOVABLE_TAB_PATTERNS }),
        chrome.storage.local.get(STORAGE_KEY_ALL_PROJECTS),
        safeGetFocusedWindowId(),
    ]);

    const projects: StoredProject[] = projectsResult[STORAGE_KEY_ALL_PROJECTS] ?? [];
    const projectNameById = new Map<string, string>();
    for (const p of projects) projectNameById.set(p.id, p.name);

    const injections = getTabInjections();

    const out: OpenLovableTabInfo[] = tabs.map((t) => {
        const tabId = typeof t.id === "number" ? t.id : null;
        const record = tabId !== null ? injections[tabId] : undefined;
        const projectId = record?.projectId ?? null;
        const projectName = projectId !== null ? (projectNameById.get(projectId) ?? null) : null;
        return {
            tabId,
            title: t.title ?? "",
            url: t.url ?? "",
            active: t.active === true,
            windowFocused: focusedWindow !== null && t.windowId === focusedWindow,
            projectId,
            projectName,
            bindingSource: record !== undefined ? "injection" : "none",
        };
    });

    return { tabs: out, capturedAt: new Date().toISOString() };
}

async function safeGetFocusedWindowId(): Promise<number | null> {
    try {
        const w = await chrome.windows.getLastFocused();
        return typeof w.id === "number" ? w.id : null;
    } catch {
        return null;
    }
}
