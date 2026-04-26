/**
 * Marco Extension — Failure Report Bundle Exporter
 *
 * Pure helpers that turn a selected list of {@link FailureReport}s into a
 * single JSON bundle suitable for sharing with an AI assistant.
 *
 * Kept UI-free so it can be unit-tested in node without jsdom and reused
 * by both the React panel and any future CLI/diagnostic dump.
 *
 * Bundle shape:
 *   {
 *     Generator:   "marco-extension",
 *     Version:     1,
 *     ExportedAt:  ISO string,
 *     Count:       number of reports,
 *     Reports:     FailureReport[]
 *   }
 *
 * @see ./failure-toast.ts            — Single-report copy/toast helper.
 * @see @/background/recorder/failure-logger — FailureReport shape.
 */

import type { FailureReport } from "@/background/recorder/failure-logger";

export interface FailureBundle {
    readonly Generator: "marco-extension";
    readonly Version: 1;
    readonly ExportedAt: string;
    readonly Count: number;
    readonly Reports: ReadonlyArray<FailureReport>;
}

export interface BuildBundleOpts {
    readonly Now?: () => Date;
}

/** Build the JSON-serialisable bundle (deterministic when `Now` is injected). */
export function buildFailureBundle(
    reports: ReadonlyArray<FailureReport>,
    opts: BuildBundleOpts = {},
): FailureBundle {
    const now = opts.Now ?? ((): Date => new Date());
    return {
        Generator: "marco-extension",
        Version: 1,
        ExportedAt: now().toISOString(),
        Count: reports.length,
        Reports: reports,
    };
}

/** Pretty-printed JSON ready to drop into a Blob. */
export function serializeFailureBundle(bundle: FailureBundle): string {
    return JSON.stringify(bundle, null, 2);
}

/**
 * Default filename: `marco-failure-reports-YYYY-MM-DD-HHmm.json`.
 * Uses UTC slice so the test suite stays deterministic with an injected `Now`.
 */
export function buildFailureBundleFilename(now: Date = new Date()): string {
    const iso = now.toISOString();             // 2026-04-26T10:30:00.000Z
    const date = iso.slice(0, 10);             // 2026-04-26
    const time = iso.slice(11, 16).replace(":", ""); // 1030
    return `marco-failure-reports-${date}-${time}.json`;
}
