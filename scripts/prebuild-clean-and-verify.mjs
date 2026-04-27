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
import { fileURLToPath } from "node:url";

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

function verifyStepLibrary() {
    const dirAbs = join(ROOT, STEP_LIB_DIR);
    console.log("🔍 [prebuild-clean-and-verify] Verifying " + STEP_LIB_DIR + "/ contents…");

    if (!existsSync(dirAbs)) {
        fail(
            "Step-library directory missing.\n" +
            "   Expected path : " + dirAbs + "\n" +
            "   Missing item  : " + STEP_LIB_DIR + "/\n" +
            "   Reason        : Bundling will fail at the first import from this directory."
        );
    }

    const stat = statSync(dirAbs);
    if (!stat.isDirectory()) {
        fail(
            "Step-library path exists but is not a directory.\n" +
            "   Path         : " + dirAbs + "\n" +
            "   Reason       : Expected a directory containing step modules."
        );
    }

    const present = new Set(readdirSync(dirAbs));
    const missing = EXPECTED_FILES.filter((f) => !present.has(f));
    if (missing.length > 0) {
        fail(
            "Required step-library file(s) missing.\n" +
            "   Directory     : " + dirAbs + "\n" +
            "   Missing items : " + missing.join(", ") + "\n" +
            "   Reason        : These modules are imported by the build graph; absent files trigger ENOENT inside Rollup.\n" +
            "   Fix           : Restore from git history, or update EXPECTED_FILES in scripts/prebuild-clean-and-verify.mjs if removal was intentional."
        );
    }

    // Empty-file guard — an empty .ts file usually breaks named-export imports.
    const empties = EXPECTED_FILES.filter((f) => statSync(join(dirAbs, f)).size === 0);
    if (empties.length > 0) {
        fail(
            "Step-library file(s) are empty.\n" +
            "   Directory   : " + dirAbs + "\n" +
            "   Empty items : " + empties.join(", ") + "\n" +
            "   Reason      : Empty modules cannot expose the named exports importers rely on."
        );
    }

    console.log("   ✓ " + EXPECTED_FILES.length + " expected files present and non-empty");
}

clearCaches();
verifyStepLibrary();
console.log("✅ [prebuild-clean-and-verify] Cache cleared, step-library verified — safe to bundle.\n");
