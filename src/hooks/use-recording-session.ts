/**
 * Marco Extension — Active Recording Session Hook
 *
 * Subscribes the React UI to the recorder draft persisted by
 * `recorder-session-storage.ts`. Reads from `chrome.storage.local` when
 * available (extension context) and falls back to `window.localStorage`
 * for the Lovable preview / Vite dev server so the FloatingController can
 * still be exercised end-to-end without the extension shell.
 *
 * Returns the current `RecordingSession` (or null when Idle) plus
 * imperative `pause` / `resume` / `stop` dispatchers that update the
 * persisted draft via the pure {@link recorderReducer}. Other surfaces
 * (toolbar, content script) observe the same key and pick up the change.
 *
 * @see ../background/recorder/recorder-store.ts        — Pure reducer
 * @see ../background/recorder/recorder-session-storage.ts — chrome.storage adapter
 */

import { useCallback, useEffect, useState } from "react";

import {
    recorderReducer,
    type RecorderAction,
} from "@/background/recorder/recorder-store";
import {
    RECORDER_SESSION_STORAGE_KEY,
    type RecordingSession,
} from "@/background/recorder/recorder-session-types";

/* ------------------------------------------------------------------ */
/*  Storage adapter (chrome.storage.local with localStorage fallback)  */
/* ------------------------------------------------------------------ */

interface ChromeStorageLocalLike {
    get: (keys: string | string[]) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (keys: string | string[]) => Promise<void>;
    onChanged?: {
        addListener: (cb: ChangeListener) => void;
        removeListener: (cb: ChangeListener) => void;
    };
}

type ChangeListener = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string,
) => void;

interface ChromeApi {
    storage?: {
        local?: ChromeStorageLocalLike;
        onChanged?: {
            addListener: (cb: ChangeListener) => void;
            removeListener: (cb: ChangeListener) => void;
        };
    };
}

function getChromeStorage(): ChromeStorageLocalLike | null {
    const api = (globalThis as { chrome?: ChromeApi }).chrome;
    return api?.storage?.local ?? null;
}

function getOnChanged(): ChromeApi["storage"] extends infer S ? S extends { onChanged?: infer O } ? O : null : null {
    const api = (globalThis as { chrome?: ChromeApi }).chrome;
    return (api?.storage?.onChanged ?? null) as never;
}

async function readFromStorage(): Promise<RecordingSession | null> {
    const local = getChromeStorage();
    if (local !== null) {
        const result = await local.get(RECORDER_SESSION_STORAGE_KEY);
        return parseSession(result[RECORDER_SESSION_STORAGE_KEY]);
    }
    if (typeof window === "undefined") { return null; }
    try {
        const raw = window.localStorage.getItem(RECORDER_SESSION_STORAGE_KEY);
        if (raw === null) { return null; }
        return parseSession(JSON.parse(raw));
    } catch {
        return null;
    }
}

async function writeToStorage(session: RecordingSession): Promise<void> {
    const local = getChromeStorage();
    if (local !== null) {
        if (session.Phase === "Idle") {
            await local.remove(RECORDER_SESSION_STORAGE_KEY);
        } else {
            await local.set({ [RECORDER_SESSION_STORAGE_KEY]: session });
        }
        // Fire a same-tab event for fallback listeners (chrome.onChanged covers cross-context).
        notifyLocalChange(session);
        return;
    }
    if (typeof window === "undefined") { return; }
    if (session.Phase === "Idle") {
        window.localStorage.removeItem(RECORDER_SESSION_STORAGE_KEY);
    } else {
        window.localStorage.setItem(RECORDER_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
    notifyLocalChange(session);
}

const LOCAL_CHANGE_EVENT = "marco:recorder-session-changed";

function notifyLocalChange(session: RecordingSession): void {
    if (typeof window === "undefined") { return; }
    window.dispatchEvent(new CustomEvent(LOCAL_CHANGE_EVENT, { detail: session }));
}

function parseSession(value: unknown): RecordingSession | null {
    if (typeof value !== "object" || value === null) { return null; }
    const v = value as Record<string, unknown>;
    const phaseOk = v.Phase === "Idle" || v.Phase === "Recording" || v.Phase === "Paused";
    if (
        typeof v.SessionId !== "string" ||
        typeof v.ProjectSlug !== "string" ||
        typeof v.StartedAt !== "string" ||
        !Array.isArray(v.Steps) ||
        !phaseOk
    ) {
        return null;
    }
    return value as RecordingSession;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export interface UseRecordingSessionResult {
    /** Current active session, or null when Idle / no draft. */
    readonly session: RecordingSession | null;
    /** True while the initial storage read is in flight. */
    readonly loading: boolean;
    readonly start: (projectSlug?: string) => Promise<void>;
    readonly pause: () => Promise<void>;
    readonly resume: () => Promise<void>;
    readonly stop: () => Promise<void>;
}

function newSessionId(): string {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID !== undefined) { return c.randomUUID(); }
    return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useRecordingSession(): UseRecordingSessionResult {
    const [session, setSession] = useState<RecordingSession | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    /* Initial read + cross-context subscription */
    useEffect(() => {
        let cancelled = false;

        readFromStorage()
            .then((s) => {
                if (cancelled) { return; }
                setSession(s);
                setLoading(false);
            })
            .catch(() => {
                if (cancelled) { return; }
                setLoading(false);
            });

        const onChromeChange: ChangeListener = (changes, area) => {
            if (area !== "local") { return; }
            const change = changes[RECORDER_SESSION_STORAGE_KEY];
            if (change === undefined) { return; }
            setSession(parseSession(change.newValue));
        };

        const onChanged = getOnChanged() as { addListener?: (cb: ChangeListener) => void; removeListener?: (cb: ChangeListener) => void } | null;
        onChanged?.addListener?.(onChromeChange);

        const onLocalChange = (e: Event) => {
            const detail = (e as CustomEvent<RecordingSession>).detail;
            setSession(detail.Phase === "Idle" ? null : detail);
        };
        const onStorageEvent = (e: StorageEvent) => {
            if (e.key !== RECORDER_SESSION_STORAGE_KEY) { return; }
            setSession(e.newValue === null ? null : parseSession(JSON.parse(e.newValue)));
        };
        if (typeof window !== "undefined") {
            window.addEventListener(LOCAL_CHANGE_EVENT, onLocalChange as EventListener);
            window.addEventListener("storage", onStorageEvent);
        }

        return () => {
            cancelled = true;
            onChanged?.removeListener?.(onChromeChange);
            if (typeof window !== "undefined") {
                window.removeEventListener(LOCAL_CHANGE_EVENT, onLocalChange as EventListener);
                window.removeEventListener("storage", onStorageEvent);
            }
        };
    }, []);

    const dispatch = useCallback(async (action: RecorderAction) => {
        const current = await readFromStorage();
        if (current === null) { return; }
        const next = recorderReducer(current, action);
        await writeToStorage(next);
        setSession(next.Phase === "Idle" ? null : next);
    }, []);

    const start = useCallback(async (projectSlug?: string) => {
        const current = await readFromStorage();
        if (current !== null && current.Phase !== "Idle") { return; }
        const seed: RecordingSession = {
            SessionId: "",
            ProjectSlug: projectSlug ?? "default",
            StartedAt: "",
            Phase: "Idle",
            Steps: [],
        };
        const next = recorderReducer(seed, {
            Kind: "Start",
            ProjectSlug: projectSlug ?? "default",
            SessionId: newSessionId(),
            StartedAt: new Date().toISOString(),
        });
        await writeToStorage(next);
        setSession(next);
    }, []);

    const pause = useCallback(() => dispatch({ Kind: "Pause" }), [dispatch]);
    const resume = useCallback(() => dispatch({ Kind: "Resume" }), [dispatch]);
    const stop = useCallback(() => dispatch({ Kind: "Stop" }), [dispatch]);

    return { session, loading, start, pause, resume, stop };
}
