/**
 * Marco Extension — Custom Keyword Events store
 *
 * Each KeywordEvent associates a user-defined keyword/label with an ordered
 * list of {@link KeywordEventStep}s that should fire during playback. Steps
 * are either a key press (e.g. `Enter`, `Ctrl+Tab`) or a wait period in ms.
 *
 * Persistence: localStorage under `marco-keyword-events-v1` (JSON array).
 * Pure presentation/state — playback wiring is consumed elsewhere.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "marco-keyword-events-v1";

export type KeywordEventStep =
    | { readonly Kind: "Key"; readonly Id: string; readonly Combo: string }
    | { readonly Kind: "Wait"; readonly Id: string; readonly DurationMs: number };

export interface KeywordEvent {
    readonly Id: string;
    readonly Keyword: string;
    readonly Description: string;
    readonly Steps: readonly KeywordEventStep[];
    readonly Enabled: boolean;
}

export interface UseKeywordEventsApi {
    readonly events: readonly KeywordEvent[];
    readonly addEvent: (keyword: string, description?: string) => string;
    readonly removeEvent: (id: string) => void;
    readonly updateEvent: (id: string, patch: Partial<Omit<KeywordEvent, "Id">>) => void;
    readonly addStep: (eventId: string, step: Omit<KeywordEventStep, "Id">) => void;
    readonly removeStep: (eventId: string, stepId: string) => void;
    readonly moveStep: (eventId: string, stepId: string, direction: "up" | "down") => void;
}

const newId = (): string =>
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `ke_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function load(): KeywordEvent[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((e): e is KeywordEvent =>
            !!e && typeof e === "object" && typeof (e as KeywordEvent).Id === "string",
        );
    } catch {
        return [];
    }
}

function save(events: readonly KeywordEvent[]): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch { /* quota / SSR */ }
}

export function useKeywordEvents(): UseKeywordEventsApi {
    const [events, setEvents] = useState<readonly KeywordEvent[]>(() => load());

    useEffect(() => { save(events); }, [events]);

    const addEvent = useCallback((keyword: string, description = ""): string => {
        const id = newId();
        const next: KeywordEvent = {
            Id: id,
            Keyword: keyword.trim() || "untitled",
            Description: description,
            Steps: [],
            Enabled: true,
        };
        setEvents(prev => [...prev, next]);
        return id;
    }, []);

    const removeEvent = useCallback((id: string) => {
        setEvents(prev => prev.filter(e => e.Id !== id));
    }, []);

    const updateEvent = useCallback((id: string, patch: Partial<Omit<KeywordEvent, "Id">>) => {
        setEvents(prev => prev.map(e => e.Id === id ? { ...e, ...patch } : e));
    }, []);

    const addStep = useCallback((eventId: string, step: Omit<KeywordEventStep, "Id">) => {
        const withId = { ...step, Id: newId() } as KeywordEventStep;
        setEvents(prev => prev.map(e =>
            e.Id === eventId ? { ...e, Steps: [...e.Steps, withId] } : e,
        ));
    }, []);

    const removeStep = useCallback((eventId: string, stepId: string) => {
        setEvents(prev => prev.map(e =>
            e.Id === eventId ? { ...e, Steps: e.Steps.filter(s => s.Id !== stepId) } : e,
        ));
    }, []);

    const moveStep = useCallback((eventId: string, stepId: string, direction: "up" | "down") => {
        setEvents(prev => prev.map(e => {
            if (e.Id !== eventId) return e;
            const idx = e.Steps.findIndex(s => s.Id === stepId);
            if (idx < 0) return e;
            const target = direction === "up" ? idx - 1 : idx + 1;
            if (target < 0 || target >= e.Steps.length) return e;
            const copy = [...e.Steps];
            const [moved] = copy.splice(idx, 1);
            copy.splice(target, 0, moved);
            return { ...e, Steps: copy };
        }));
    }, []);

    return { events, addEvent, removeEvent, updateEvent, addStep, removeStep, moveStep };
}
