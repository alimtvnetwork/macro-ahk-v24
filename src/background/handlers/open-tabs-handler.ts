/**
 * Open Lovable Tabs Handler
 *
 * Returns the list of currently open Chrome tabs whose URL matches the
 * Lovable platform patterns (lovable.dev / *.lovable.app), enriched with
 * each tab's bound project — derived from BOTH:
 *   1. the in-memory tabInjections map (state-manager), and
 *   2. an automatic per-tab workspace probe (PROBE_DETECTED_WORKSPACE)
 *      sent through the existing message bus to the macro-controller
 *      running in each tab.
 *
 * The probe is best-effort: tabs without the controller injected (or that
 * time out) simply omit the detected workspace fields. Probes run in
 * parallel to keep the panel responsive.
 *
 * Consumed by the macro-controller's "Open Lovable Tabs" panel, which
 * cannot call chrome.tabs directly from the MAIN world
 * (mem://architecture/injection-context-awareness).
 */

import { STORAGE_KEY_ALL_PROJECTS } from "../../shared/constants";
import type { StoredProject } from "../../shared/project-types";
import { getTabInjections } from "../state-manager";

export type DetectedWorkspaceSource = "api" | "cache" | "dom" | "none";

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
    /** Path used to bind: "injection", "probe", or "none". */
    bindingSource: "injection" | "probe" | "none";
    /** Workspace name detected by the controller running in the tab (best-effort). */
    detectedWorkspaceName: string | null;
    /** Workspace ID cached by the controller running in the tab (best-effort). */
    detectedWorkspaceId: string | null;
    /** Where the controller derived the workspace name from. */
    detectedWorkspaceSource: DetectedWorkspaceSource | null;
    /** Why the probe did not return data — null on success, a short reason on failure. */
    probeError: string | null;
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

interface ProbePayload {
    workspaceName?: string;
    workspaceId?: string;
    projectId?: string | null;
    source?: DetectedWorkspaceSource;
}

interface ProbeResult {
    payload: ProbePayload | null;
    error: string | null;
}

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

    // Probe every tab in parallel. Errors / missing controllers are tolerated.
    const probeResults = await Promise.all(
        tabs.map((t) => probeTabWorkspace(typeof t.id === "number" ? t.id : null)),
    );

    const out: OpenLovableTabInfo[] = tabs.map((t, i) => {
        const tabId = typeof t.id === "number" ? t.id : null;
        const record = tabId !== null ? injections[tabId] : undefined;
        const probe = probeResults[i];
        const probePayload = probe.payload;

        // Project ID resolution priority: injection record → probe-reported projectId.
        let projectId: string | null = record?.projectId ?? null;
        let bindingSource: OpenLovableTabInfo["bindingSource"] = record !== undefined ? "injection" : "none";
        if (projectId === null && probePayload && typeof probePayload.projectId === "string" && probePayload.projectId !== "") {
            projectId = probePayload.projectId;
            bindingSource = "probe";
        }

        const projectName = projectId !== null ? (projectNameById.get(projectId) ?? null) : null;

        return {
            tabId,
            title: t.title ?? "",
            url: t.url ?? "",
            active: t.active === true,
            windowFocused: focusedWindow !== null && t.windowId === focusedWindow,
            projectId,
            projectName,
            bindingSource,
            detectedWorkspaceName: probePayload?.workspaceName?.trim() || null,
            detectedWorkspaceId: probePayload?.workspaceId?.trim() || null,
            detectedWorkspaceSource: probePayload?.source ?? null,
            probeError: probe.error,
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

/**
 * Asks a tab's content-script relay to probe the MAIN-world macro-controller
 * for its detected workspace snapshot. Returns null payload + a reason when
 * the tab cannot answer (no content script, page navigating, timeout, …).
 */
async function probeTabWorkspace(tabId: number | null): Promise<ProbeResult> {
    if (tabId === null) {
        return { payload: null, error: "no tab id" };
    }
    try {
        const response: unknown = await chrome.tabs.sendMessage(tabId, { type: "PROBE_DETECTED_WORKSPACE" });
        if (response === undefined || response === null) {
            return { payload: null, error: "empty probe response" };
        }
        const r = response as { isOk?: boolean; payload?: ProbePayload | null; errorMessage?: string };
        if (r.isOk === false) {
            return { payload: null, error: r.errorMessage ?? "probe failed" };
        }
        return { payload: r.payload ?? null, error: null };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Common benign cases: "Could not establish connection. Receiving end does not exist."
        return { payload: null, error: msg };
    }
}
