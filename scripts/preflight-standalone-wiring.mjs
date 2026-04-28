#!/usr/bin/env node
/**
 * Preflight: Standalone Registry Wiring
 * -------------------------------------
 * Sequential fail-fast wrapper around `report-standalone-registry.mjs --json`.
 * Designed to run BEFORE the heavy CI jobs (build-*, e2e) so wiring gaps
 * surface in <1s with a precise, copy-pasteable remediation list.
 *
 * For every gap the JSON report exposes, this script prints:
 *   • The exact file path the developer (or AI agent) must create / edit
 *   • The exact token / array entry / job-id that is missing
 *   • A ready-to-paste snippet when the fix is "create a new file"
 *
 * Exit codes
 *   0  — every standalone script is fully wired
 *   1  — at least one gap detected (CI should block)
 *   2  — internal error invoking the underlying report
 *
 * No retry, no backoff (per project no-retry policy). One pass, one verdict.
 *
 * Author: Riseup Asia LLC
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPORT_SCRIPT = path.join(SCRIPT_DIR, "report-standalone-registry.mjs");

function runReport() {
    const result = spawnSync(process.execPath, [REPORT_SCRIPT, "--json"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error) {
        console.error(`[preflight] failed to spawn report: ${result.error.message}`);
        process.exit(2);
    }
    if (result.status !== 0 && result.status !== 1) {
        // 0 = report-only OK, 1 = strict gap (we run report-only so 1 shouldn't happen)
        console.error(`[preflight] report exited with unexpected status ${result.status}`);
        if (result.stderr) console.error(result.stderr);
        process.exit(2);
    }
    try {
        return JSON.parse(result.stdout);
    } catch (err) {
        console.error(`[preflight] failed to parse report JSON: ${err.message}`);
        process.exit(2);
    }
}

/**
 * For a given gap, return:
 *   { fixFile, action, snippet? }
 * action is a one-line imperative; snippet (optional) is multi-line content
 * to drop into a brand-new file.
 */
function describeFix(scriptName, locationKey, registry) {
    const meta = registry[locationKey] ?? { fixFile: null, label: locationKey };
    switch (locationKey) {
        case "pkgScript":
            return {
                fixFile: "package.json",
                action: `Add to "scripts": "build:${scriptName}": "node scripts/check-axios-version.mjs && node scripts/compile-instruction.mjs standalone-scripts/${scriptName} && tsc --noEmit -p tsconfig.${scriptName}.json && vite build --config vite.config.${scriptName}.ts && echo Built ${scriptName}.js"`,
            };
        case "pkgExtensionChain":
            return {
                fixFile: "package.json",
                action: `Append " && pnpm run build:${scriptName}" to the "build:extension" script chain`,
            };
        case "buildStandalone":
            return {
                fixFile: "scripts/build-standalone.mjs",
                action: `Add "${scriptName}" to the exported PROJECTS array`,
            };
        case "checkDist":
            return {
                fixFile: "scripts/check-standalone-dist.mjs",
                action: `Add "${scriptName}" entry to REQUIRED_ARTIFACTS (expects standalone-scripts/${scriptName}/dist/${scriptName}.js + instruction.json)`,
            };
        case "tsconfig":
            return {
                fixFile: `tsconfig.${scriptName}.json`,
                action: `CREATE this file at repo root`,
                snippet:
                    `{\n` +
                    `    "extends": "./tsconfig.standalone.base.json",\n` +
                    `    "compilerOptions": {\n` +
                    `        "outDir": "standalone-scripts/${scriptName}/dist"\n` +
                    `    },\n` +
                    `    "include": ["standalone-scripts/${scriptName}/src/**/*.ts"]\n` +
                    `}\n`,
            };
        case "viteConfig":
            return {
                fixFile: `vite.config.${scriptName}.ts`,
                action: `CREATE this file at repo root`,
                snippet:
                    `import { defineConfig } from "vite";\n` +
                    `import path from "node:path";\n\n` +
                    `export default defineConfig({\n` +
                    `    build: {\n` +
                    `        outDir: path.resolve(__dirname, "standalone-scripts/${scriptName}/dist"),\n` +
                    `        emptyOutDir: false,\n` +
                    `        sourcemap: false,\n` +
                    `        lib: {\n` +
                    `            entry: path.resolve(__dirname, "standalone-scripts/${scriptName}/src/index.ts"),\n` +
                    `            name: "${scriptName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}",\n` +
                    `            formats: ["iife"],\n` +
                    `            fileName: () => "${scriptName}.js",\n` +
                    `        },\n` +
                    `        rollupOptions: { output: { extend: true } },\n` +
                    `    },\n` +
                    `});\n`,
            };
        case "ciJob":
            return {
                fixFile: ".github/workflows/ci.yml",
                action: `Add a job named "build-${scriptName}" that runs "pnpm run build:${scriptName}" and uploads standalone-scripts/${scriptName}/dist/ as artifact "${scriptName}-dist"`,
                snippet:
                    `  build-${scriptName}:\n` +
                    `    name: Build · ${scriptName}\n` +
                    `    needs: setup\n` +
                    `    runs-on: ubuntu-latest\n` +
                    `    steps:\n` +
                    `      - uses: actions/checkout@v4\n` +
                    `      - uses: actions/setup-node@v4\n` +
                    `        with: { node-version: 20 }\n` +
                    `      - uses: pnpm/action-setup@v4\n` +
                    `        with: { version: 9, run_install: false }\n` +
                    `      - name: Install dependencies\n` +
                    `        run: pnpm install --prefer-offline --no-frozen-lockfile\n` +
                    `      - name: Build ${scriptName}\n` +
                    `        run: pnpm run build:${scriptName}\n` +
                    `      - uses: actions/upload-artifact@v4\n` +
                    `        with:\n` +
                    `          name: ${scriptName}-dist\n` +
                    `          path: standalone-scripts/${scriptName}/dist/\n` +
                    `          retention-days: 1\n`,
            };
        default:
            return {
                fixFile: meta.fixFile ?? "(unknown)",
                action: `Wire "${scriptName}" into ${meta.label ?? locationKey}`,
            };
    }
}

function main() {
    const report = runReport();
    const registry = report.locationsRegistry ?? {};
    const scripts = Array.isArray(report.scripts) ? report.scripts : [];
    const gappy = scripts.filter((s) => !s.fullyWired);

    console.log("Preflight · Standalone Wiring");
    console.log("══════════════════════════════");
    console.log(`Scripts scanned : ${scripts.length}`);
    console.log(`Fully wired     : ${scripts.length - gappy.length}`);
    console.log(`With gaps       : ${gappy.length}`);
    console.log("");

    if (gappy.length === 0) {
        console.log("✓ All standalone scripts are fully wired. CI may proceed.");
        process.exit(0);
    }

    console.log("✗ Wiring gaps detected. Fix the following BEFORE re-running CI:");
    console.log("");

    for (const script of gappy) {
        console.log(`▸ ${script.name}  (${script.gaps.length} gap${script.gaps.length === 1 ? "" : "s"})`);
        for (const gapKey of script.gaps) {
            const fix = describeFix(script.name, gapKey, registry);
            console.log(`    • ${gapKey}`);
            console.log(`        file   : ${fix.fixFile}`);
            console.log(`        action : ${fix.action}`);
            if (fix.snippet) {
                console.log(`        snippet:`);
                for (const line of fix.snippet.split("\n")) {
                    if (line.length > 0) console.log(`            ${line}`);
                }
            }
            // GitHub Actions inline annotation
            if (process.env.GITHUB_ACTIONS === "true") {
                const title = `Standalone wiring gap: ${script.name} · ${gapKey}`;
                console.log(`::error file=${fix.fixFile},title=${title}::${fix.action}`);
            }
        }
        console.log("");
    }

    console.log(`Total gaps: ${gappy.reduce((n, s) => n + s.gaps.length, 0)}`);
    console.log(`Authority : scripts/report-standalone-registry.mjs --strict`);
    process.exit(1);
}

main();