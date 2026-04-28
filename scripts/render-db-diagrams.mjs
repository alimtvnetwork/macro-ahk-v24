#!/usr/bin/env node
/**
 * Render spec/23-database/diagrams/*.mmd → spec/23-database/images/*.png
 *
 * Uses @mermaid-js/mermaid-cli via npx (no permanent dev dependency).
 * Sequential, fail-fast — honors mem://constraints/no-retry-policy.
 *
 * Usage:
 *   node scripts/render-db-diagrams.mjs
 */

import { readdirSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join, basename, extname } from "node:path";

const ROOT = resolve(process.cwd());
const DIAGRAMS_DIR = join(ROOT, "spec/23-database/diagrams");
const IMAGES_DIR = join(ROOT, "spec/23-database/images");

if (!existsSync(DIAGRAMS_DIR)) {
    console.error(`[render-db-diagrams] Missing source folder: ${DIAGRAMS_DIR}`);
    console.error("  Reason: spec/23-database/diagrams/ was not found.");
    process.exit(1);
}

mkdirSync(IMAGES_DIR, { recursive: true });

const sources = readdirSync(DIAGRAMS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mmd"))
    .sort();

if (sources.length === 0) {
    console.warn(`[render-db-diagrams] No .mmd files found in ${DIAGRAMS_DIR}`);
    process.exit(0);
}

console.log(`[render-db-diagrams] Rendering ${sources.length} diagram(s) → ${IMAGES_DIR}`);

let failures = 0;
for (const src of sources) {
    const srcPath = join(DIAGRAMS_DIR, src);
    const outPath = join(IMAGES_DIR, basename(src, extname(src)) + ".png");
    console.log(`  • ${src} → ${basename(outPath)}`);
    const result = spawnSync(
        "npx",
        [
            "--yes",
            "@mermaid-js/mermaid-cli",
            "-i", srcPath,
            "-o", outPath,
            "-t", "dark",
            "-b", "#222222",
            "--width", "1600",
            "-p", join(DIAGRAMS_DIR, ".puppeteer.json"),
        ],
        { stdio: "inherit", shell: process.platform === "win32" },
    );
    if (result.status !== 0) {
        failures += 1;
        console.error(`    ✖ FAILED to render ${src} (exit ${result.status ?? "n/a"})`);
        console.error(`      Source: ${srcPath}`);
        console.error(`      Output: ${outPath}`);
    }
}

if (failures > 0) {
    console.error(`[render-db-diagrams] ${failures} diagram(s) failed.`);
    process.exit(1);
}
console.log("[render-db-diagrams] Done.");
