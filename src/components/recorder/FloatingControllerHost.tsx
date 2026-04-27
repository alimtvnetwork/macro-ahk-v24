/**
 * Marco Extension — Floating Controller Host
 *
 * Thin wrapper that subscribes to the active recording session and renders
 * {@link FloatingController} only while a recording is in progress. Kept
 * separate from the controller itself so the presentational component
 * stays easy to unit-test without storage stubs.
 *
 * @see ../../hooks/use-recording-session.ts
 * @see ./FloatingController.tsx
 */

import { useRecordingSession } from "@/hooks/use-recording-session";
import { FloatingController } from "./FloatingController";

export function FloatingControllerHost(): JSX.Element | null {
    const { session, pause, resume, stop } = useRecordingSession();
    if (session === null) { return null; }
    return (
        <FloatingController
            session={session}
            onPause={pause}
            onResume={resume}
            onStop={stop}
        />
    );
}
