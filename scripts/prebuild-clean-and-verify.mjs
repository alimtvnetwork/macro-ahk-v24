#!/usr/bin/env node
/**
 * prebuild-clean-and-verify.mjs
 *
 * Pre-build hygiene step:
 *   1. Clears Vite + TypeScript caches that have caused stale-ENOENT failures
 *      against `result-webhook` in the past.
 *   2. Verifies `src/background/recorder/step-library/` contains every
 *      expected module file before bundling.
 *
 * Exits with code 1 — and a clear path/missing-item/reason message — if any
 * expected file is missing. Cache deletion failures are non-fatal (logged).
 */

import { existsSync, rmSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { waitForBuildLock } from "./lib/build-lock.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CACHE_PATHS = [
    "node_modules/.vite",
    "node_modules/.vite-temp",
    "node_modules/.cache",
    "tsconfig.app.tsbuildinfo",
    "tsconfig.tsbuildinfo",
    "tsconfig.node.tsbuildinfo",
];

const STEP_LIB_DIR = "src/background/recorder/step-library";
const EXPECTED_FILES = [
    "csv-mapping.ts",
    "csv-parse.ts",
    "db.ts",
    "export-bundle.ts",
    "export-error-explainer.ts",
    "group-inputs.ts",
    "hotkey-executor.ts",
    "import-bundle.ts",
    "import-error-explainer.ts",
    "index.ts",
    "input-source.ts",
    "replay-bridge.ts",
    "result-webhook.ts",
    "run-batch.ts",
    "run-group-runner.ts",
    "schema.ts",
    "step-wait.ts",
];

function fail(msg) {
    console.error("\n❌ [prebuild-clean-and-verify] " + msg + "\n");
    process.exit(1);
}

function clearCaches() {
    console.log("🧹 [prebuild-clean-and-verify] Clearing Vite/TS caches…");
    for (const rel of CACHE_PATHS) {
        const abs = join(ROOT, rel);
        if (!existsSync(abs)) {
            continue;
        }
        try {
            rmSync(abs, { recursive: true, force: true });
            console.log("   removed: " + rel);
        } catch (err) {
            // Non-fatal — caches are best-effort.
            console.warn("   could not remove " + rel + " (" + (err?.message ?? "unknown") + ") — continuing");
        }
    }
}

/**
 * Probe the step-library directory once. Returns:
 *   { ok: true,  present, empties: [] }            on success
 *   { ok: false, kind: "no-dir" | "not-dir" | "missing" | "empty",
 *                missing, empties, present, dirAbs } on any failure.
 *
 * Does NOT exit — callers decide whether to retry (e.g. after clearing
 * caches) before failing the build.
 */
function probeStepLibrary() {
    const dirAbs = join(ROOT, STEP_LIB_DIR);

    if (!existsSync(dirAbs)) {
        return { ok: false, kind: "no-dir", dirAbs, missing: [], empties: [], present: new Set() };
    }
    const stat = statSync(dirAbs);
    if (!stat.isDirectory()) {
        return { ok: false, kind: "not-dir", dirAbs, missing: [], empties: [], present: new Set() };
    }
    const present = new Set(readdirSync(dirAbs));
    const missing = EXPECTED_FILES.filter((f) => !present.has(f));
    if (missing.length > 0) {
        return { ok: false, kind: "missing", dirAbs, missing, empties: [], present };
    }
    const empties = EXPECTED_FILES.filter((f) => statSync(join(dirAbs, f)).size === 0);
    if (empties.length > 0) {
        return { ok: false, kind: "empty", dirAbs, missing: [], empties, present };
    }
    return { ok: true, dirAbs, present, missing: [], empties: [] };
}

function buildMissingFailureMessage(probe) {
    const { dirAbs, missing, present } = probe;
    const probeReports = missing.map((name) => {
        const abs = join(dirAbs, name);
        const lines = ["   • " + name];
        lines.push("       checked path        : " + abs);
        lines.push("       file:// URL         : " + pathToFileURL(abs).href);
        lines.push("       existsSync()        : " + existsSync(abs));
        try {
            const s = statSync(abs);
            lines.push("       statSync.isFile     : " + s.isFile());
            lines.push("       statSync.size       : " + s.size + " bytes");
            lines.push("       statSync.mtime      : " + s.mtime.toISOString());
        } catch (err) {
            lines.push("       statSync()          : threw " + (err?.code ?? "ERR") + " — " + (err?.message ?? "unknown"));
            lines.push("       size                : n/a (no stat)");
            lines.push("       mtime               : n/a (no stat)");
        }
        const siblings = present.size > 0
            ? Array.from(present).sort().join(", ")
            : "(directory empty)";
        lines.push("       siblings in dir     : " + siblings);
        return lines.join("\n");
    }).join("\n");

    const relPaths = missing.map((name) => `${STEP_LIB_DIR}/${name}`);
    const checkoutCmd = `git checkout HEAD -- ${relPaths.join(" ")}`;
    const restoreCmd = `git restore --source=HEAD --staged --worktree -- ${relPaths.join(" ")}`;
    const logCmd = `git log --all --diff-filter=D --name-only --pretty=format:"%h %ad %s" --date=short -- ${relPaths.join(" ")}`;
    const expectedList = EXPECTED_FILES.map((f) => (missing.includes(f) ? "   ✗ " + f + "  (MISSING)" : "   ✓ " + f)).join("\n");

    return (
        "Required step-library file(s) missing (after cache-clear fallback retry).\n" +
        "   Directory     : " + dirAbs + "\n" +
        "   Directory URL : " + pathToFileURL(dirAbs).href + "\n" +
        "   Missing items : " + missing.join(", ") + "\n" +
        "   Reason        : These modules are imported by the build graph; absent files trigger ENOENT inside Rollup.\n" +
        "\n   Fix — restore from git (run from repo root):\n" +
        "       " + checkoutCmd + "\n" +
        "     or (modern git):\n" +
        "       " + restoreCmd + "\n" +
        "     to find the deleting commit:\n" +
        "       " + logCmd + "\n" +
        "     If the removal was intentional, edit EXPECTED_FILES in scripts/prebuild-clean-and-verify.mjs.\n" +
        "\n   EXPECTED_FILES status (" + EXPECTED_FILES.length + " entries):\n" + expectedList +
        "\n\n   Per-file checks performed:\n" + probeReports
    );
}

function verifyStepLibrary() {
    console.log("🔍 [prebuild-clean-and-verify] Verifying " + STEP_LIB_DIR + "/ contents…");
    let probe = probeStepLibrary();

    // Automatic fallback: if files are reported missing on the first probe,
    // wipe caches once and re-check. This rescues the case where a stale
    // Vite/TS cache (or filesystem dirent cache) is misleading the check.
    // The retry is single-shot — sequential fail-fast, no recursion.
    if (!probe.ok && probe.kind === "missing") {
        console.warn("⚠ [prebuild-clean-and-verify] Missing files reported on first probe: " + probe.missing.join(", "));
        console.warn("   → Clearing caches and re-checking once before failing…");
        clearCaches();
        probe = probeStepLibrary();
        if (probe.ok) {
            console.log("   ✓ Files resolved after cache-clear retry — proceeding.");
        }
    }

    if (probe.ok) {
        console.log("   ✓ " + EXPECTED_FILES.length + " expected files present and non-empty");
        return;
    }

    if (probe.kind === "no-dir") {
        fail(
            "Step-library directory missing.\n" +
            "   Expected path : " + probe.dirAbs + "\n" +
            "   Missing item  : " + STEP_LIB_DIR + "/\n" +
            "   Reason        : Bundling will fail at the first import from this directory."
        );
    }
    if (probe.kind === "not-dir") {
        fail(
            "Step-library path exists but is not a directory.\n" +
            "   Path         : " + probe.dirAbs + "\n" +
            "   Reason       : Expected a directory containing step modules."
        );
    }
    if (probe.kind === "missing") {
        fail(buildMissingFailureMessage(probe));
    }
    if (probe.kind === "empty") {
        fail(
            "Step-library file(s) are empty.\n" +
            "   Directory   : " + probe.dirAbs + "\n" +
            "   Empty items : " + probe.empties.join(", ") + "\n" +
            "   Reason      : Empty modules cannot expose the named exports importers rely on."
        );
    }
}

try {
    await waitForBuildLock();
} catch (err) {
    if (err?.code === "EBUILDLOCK") process.exit(1);
    throw err;
}
clearCaches();
verifyStepLibrary();
console.log("✅ [prebuild-clean-and-verify] Cache cleared, step-library verified — safe to bundle.\n");

