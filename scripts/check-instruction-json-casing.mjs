#!/usr/bin/env node
/**
 * check-instruction-json-casing.mjs
 *
 * Phase 2b dual-emit JSON-shape gate. Runs AFTER `compile-instruction.mjs`
 * has emitted both files into each project's `dist/`, and BEFORE the
 * vite extension build's `copyProjectScripts` plugin copies those files
 * into `chrome-extension/projects/scripts/<name>/`.
 *
 * For every `standalone-scripts/<name>/dist/instruction.json` and its
 * sibling `dist/instruction.compat.json` this script enforces:
 *
 *   ── instruction.json (canonical)
 *   • Every object key in the recursive tree starts with [A-Z] (PascalCase),
 *     OR is one of the documented lowercase binding identifiers
 *     ({config, theme} — these are user-chosen NAMES inside
 *     ConfigSeedIds, not schema keys; see CHECK A in
 *     scripts/check-pascalcase-instruction-migration.mjs).
 *   • Zero camelCase keys allowed (a key starting with [a-z] that is NOT
 *     in the lowercase allowlist is a hard fail).
 *
 *   ── instruction.compat.json (transitional camelCase snapshot)
 *   • Every object key starts with [a-z_] (camelCase or snake-ish) — i.e.
 *     no key may begin with [A-Z]. The lowercase binding identifiers
 *     ({config, theme}) are also valid here (they pass through unchanged
 *     during the camelCase conversion in compile-instruction.mjs).
 *
 * Why this is its OWN script (not folded into
 * check-pascalcase-instruction-migration.mjs):
 *   That checker validates SOURCE FILES (`src/instruction.ts` literals
 *   and `.ts/.mjs` consumers). This checker validates the BUILD ARTIFACTS
 *   (`dist/instruction.json` + `dist/instruction.compat.json`) — the actual
 *   bytes that will be copied into the extension and shipped. Source can
 *   be clean while artifacts drift if `compile-instruction.mjs` has a bug
 *   (wrong conversion, partial walk, alias leak, etc.). This script is
 *   the second line of defence against shipping a wrong-shape JSON.
 *
 * Wiring: invoked from package.json scripts immediately after every
 * `compile-instruction.mjs` invocation in the build pipeline, and from
 * `build:extension` after the bulk `compile-instruction.mjs` calls
 * complete and BEFORE `vite build --config vite.config.extension.ts`
 * (which is where copyProjectScripts runs).
 *
 * Usage:
 *   node scripts/check-instruction-json-casing.mjs
 *     → scans every standalone-scripts/<name>/dist/{instruction,instruction.compat}.json
 *
 *   node scripts/check-instruction-json-casing.mjs <project-folder>
 *     → scans only that one project (matches compile-instruction.mjs CLI)
 *     → e.g. node scripts/check-instruction-json-casing.mjs standalone-scripts/macro-controller
 *
 *   node scripts/check-instruction-json-casing.mjs --json [<project-folder>]
 *     → emits a single JSON document to stdout describing every scanned
 *       project, the two artifacts, and every casing violation with its
 *       JSON-Pointer-like path. Suppresses human-readable logs and GitHub
 *       Actions ::error annotations so the stdout stream is pure JSON
 *       (machine-parseable for debugging, dashboards, or piping into jq).
 *       Exit code semantics are unchanged. Schema:
 *         { tool, version, scannedProjects, exitCode,
 *           projects: [{ name, skipped, missingArtifact,
 *             artifacts: { canonical: { path, shape, ok, parseError,
 *               violationCount, violations: [{ path, key, expected }] },
 *                          compat:    { … } } }] }
 *
 * Exit codes:
 *   0 — every scanned project's two artifacts pass both shape checks
 *   1 — at least one violation (full per-key path report + GitHub
 *       Actions ::error annotations on the offending JSON files)
 *   2 — repo layout broken (no standalone-scripts/) or a referenced
 *       project lacks a dist/ — surfaces a missing-step problem
 *       instead of a false pass.
 *
 * Resolves: build-artifact JSON shape gate for the Phase 2b dual-emit
 *           contract documented in mem://architecture/instruction-dual-emit-phase-2b.md
 *           and mem://standards/pascalcase-json-keys.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const STANDALONE_DIR = resolve(REPO_ROOT, "standalone-scripts");

/* ----------------------------------------------------------------- */
/*  Lowercase keys allowed in BOTH shapes.                            */
/*                                                                    */
/*  These are user-chosen binding names that appear as object keys    */
/*  inside ConfigSeedIds (e.g. `{ config: "...", theme: "..." }`).   */
/*  They survive the PascalCase→camelCase conversion unchanged        */
/*  because their first char is already lowercase, so the same        */
/*  allowlist applies to both files. Mirrors                          */
/*  LOWERCASE_KEY_ALLOWLIST in check-pascalcase-instruction-migration.mjs. */
/* ----------------------------------------------------------------- */
const LOWERCASE_KEY_ALLOWLIST = new Set(["config", "theme"]);

const rel = (p) => relative(REPO_ROOT, p) || p;

/** Emit a GitHub Actions error annotation on the JSON file itself. */
function annotate(file, msg) {
    process.stdout.write(`::error file=${file}::${msg}\n`);
}

/* ----------------------------------------------------------------- */
/*  Recursive key walker.                                             */
/*                                                                    */
/*  Yields every {path, key} pair encountered as the tree is walked. */
/*  Arrays are descended (path becomes `…[i]`) but their indices are */
/*  not yielded as keys. Non-object leaves are skipped — only object */
/*  KEYS are subject to casing rules. JSON null is ignored.           */
/*                                                                    */
/*  Path uses dotted JSON-Pointer-like notation rooted at `$` for     */
/*  human-readable error messages (`$.Assets.Scripts[0].File`).       */
/* ----------------------------------------------------------------- */
function* walkKeys(value, path = "$") {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            yield* walkKeys(value[i], `${path}[${i}]`);
        }
        return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, val] of Object.entries(value)) {
        yield { path, key };
        yield* walkKeys(val, `${path}.${key}`);
    }
}

/* ----------------------------------------------------------------- */
/*  Per-shape key validators. Each returns true if the key is legal  */
/*  for that shape, false otherwise.                                  */
/* ----------------------------------------------------------------- */

/** PascalCase shape: key starts with [A-Z], or is in lowercase allowlist. */
function isLegalPascalKey(key) {
    if (LOWERCASE_KEY_ALLOWLIST.has(key)) return true;
    if (!key) return false;
    const c = key.charCodeAt(0);
    // 'A'..'Z' === 65..90
    return c >= 65 && c <= 90;
}

/** camelCase shape: key starts with [a-z_], i.e. anything NOT [A-Z]. */
function isLegalCamelKey(key) {
    if (!key) return false;
    const c = key.charCodeAt(0);
    // Reject only PascalCase (uppercase-leading). Lowercase binding
    // identifiers, snake_case, leading-underscore, and digits are all
    // accepted — the only thing camelCase artifacts must never do is
    // re-introduce a PascalCase key.
    return !(c >= 65 && c <= 90);
}

/* ----------------------------------------------------------------- */
/*  Per-file scanners.                                                */
/* ----------------------------------------------------------------- */

function scanArtifact(file, predicate, shapeLabel) {
    const violations = [];
    let raw;
    try {
        raw = readFileSync(file, "utf-8");
    } catch (e) {
        return { missing: true, error: e.message, violations };
    }
    let tree;
    try {
        tree = JSON.parse(raw);
    } catch (e) {
        return { parseError: e.message, violations };
    }
    for (const { path, key } of walkKeys(tree)) {
        if (!predicate(key)) {
            violations.push({ path, key, expected: shapeLabel });
        }
    }
    return { violations };
}

function checkProject(projectName) {
    const distDir = resolve(STANDALONE_DIR, projectName, "dist");
    const canonical = join(distDir, "instruction.json");
    const compat = join(distDir, "instruction.compat.json");

    // A project without a src/instruction.ts is intentionally skipped
    // (matches compile-instruction.mjs behaviour). A project WITH a
    // source but missing dist artifacts is a hard error — it means
    // compile-instruction.mjs was not run before this checker, which
    // is a build-pipeline ordering bug.
    const tsPath = resolve(STANDALONE_DIR, projectName, "src", "instruction.ts");
    if (!existsSync(tsPath)) {
        return { skipped: true, reason: "no src/instruction.ts" };
    }
    if (!existsSync(canonical) || !existsSync(compat)) {
        return {
            missingArtifact: true,
            canonicalExists: existsSync(canonical),
            compatExists: existsSync(compat),
            distDir,
        };
    }

    const canonicalResult = scanArtifact(canonical, isLegalPascalKey, "PascalCase");
    const compatResult = scanArtifact(compat, isLegalCamelKey, "camelCase");
    return { canonical, compat, canonicalResult, compatResult };
}

/* ----------------------------------------------------------------- */
/*  Project enumeration.                                              */
/* ----------------------------------------------------------------- */

function listAllProjects() {
    if (!existsSync(STANDALONE_DIR)) return null;
    return readdirSync(STANDALONE_DIR).filter((name) => {
        try {
            return statSync(join(STANDALONE_DIR, name)).isDirectory();
        } catch {
            return false;
        }
    });
}

/**
 * Resolve the CLI argument (a folder path like
 * `standalone-scripts/macro-controller`) to a project name. Accepts
 * absolute paths, repo-relative paths, or a bare project name.
 */
function resolveProjectArg(arg) {
    const abs = resolve(REPO_ROOT, arg);
    const r = relative(STANDALONE_DIR, abs);
    if (!r || r.startsWith("..") || r.includes("/") || r.includes("\\")) {
        // Not directly inside standalone-scripts/ — fall back to basename.
        return arg.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
    }
    return r;
}

/* ----------------------------------------------------------------- */
/*  Reporter + main.                                                  */
/* ----------------------------------------------------------------- */

function reportProject(name, result) {
    if (result.skipped) {
        console.log(`ℹ  ${name} — skipped (${result.reason})`);
        return 0;
    }
    if (result.missingArtifact) {
        process.stderr.write(
            `\n✗ ${name} — dist artifacts missing in ${rel(result.distDir)}:\n` +
            `    instruction.json:        ${result.canonicalExists ? "present" : "MISSING"}\n` +
            `    instruction.compat.json: ${result.compatExists ? "present" : "MISSING"}\n` +
            `  Fix: run \`node scripts/compile-instruction.mjs standalone-scripts/${name}\` before this check.\n\n`,
        );
        return 2;
    }

    let exit = 0;

    for (const [label, file, res, shape] of [
        ["canonical", result.canonical, result.canonicalResult, "PascalCase"],
        ["compat   ", result.compat, result.compatResult, "camelCase"],
    ]) {
        if (res.parseError) {
            process.stderr.write(`✗ ${name} ${label}: JSON parse error in ${rel(file)}: ${res.parseError}\n`);
            annotate(rel(file), `Invalid JSON: ${res.parseError}`);
            exit = 1;
            continue;
        }
        if (res.violations.length === 0) {
            console.log(`✓ ${name} ${label} — ${rel(file)} is pure ${shape}`);
            continue;
        }
        process.stderr.write(
            `\n✗ ${name} ${label} — ${res.violations.length} ${shape}-shape violation(s) in ${rel(file)}:\n`,
        );
        // Cap the printed list so a totally-wrong file doesn't spam
        // CI logs with thousands of lines, but always annotate the
        // file once with the total count.
        const MAX_PRINT = 25;
        for (const v of res.violations.slice(0, MAX_PRINT)) {
            const expectation = shape === "PascalCase"
                ? `expected PascalCase (or one of {${[...LOWERCASE_KEY_ALLOWLIST].join(", ")}})`
                : `expected camelCase (no PascalCase keys allowed)`;
            process.stderr.write(`    ${v.path}  →  "${v.key}"   ${expectation}\n`);
        }
        if (res.violations.length > MAX_PRINT) {
            process.stderr.write(`    … and ${res.violations.length - MAX_PRINT} more\n`);
        }
        annotate(
            rel(file),
            `${res.violations.length} ${shape}-shape violation(s). First offender: ${res.violations[0].path} → "${res.violations[0].key}". ` +
            `Fix compile-instruction.mjs or the source instruction.ts so this artifact stays pure ${shape}.`,
        );
        exit = 1;
    }
    return exit;
}

/* ----------------------------------------------------------------- */
/*  JSON reporter — `--json` flag.                                    */
/*                                                                    */
/*  Builds a single structured document covering every scanned        */
/*  project and writes it to stdout. Suppresses the human-readable    */
/*  per-project logs and GitHub Actions ::error annotations so the    */
/*  stdout stream stays pure JSON (safe to pipe into jq, store as a  */
/*  CI artifact, or feed into a dashboard). Exit code is computed    */
/*  the same way as the text reporter so callers that only care     */
/*  about pass/fail can ignore the body.                              */
/* ----------------------------------------------------------------- */
function buildJsonProjectEntry(name, result) {
    if (result.skipped) {
        return {
            name,
            skipped: true,
            skipReason: result.reason,
            missingArtifact: false,
            artifacts: null,
            exitCode: 0,
        };
    }
    if (result.missingArtifact) {
        return {
            name,
            skipped: false,
            missingArtifact: true,
            distDir: rel(result.distDir),
            canonicalExists: result.canonicalExists,
            compatExists: result.compatExists,
            artifacts: null,
            exitCode: 2,
        };
    }

    const buildArtifact = (file, res, shape) => {
        if (res.parseError) {
            return {
                path: rel(file),
                shape,
                ok: false,
                parseError: res.parseError,
                violationCount: 0,
                violations: [],
            };
        }
        return {
            path: rel(file),
            shape,
            ok: res.violations.length === 0,
            parseError: null,
            violationCount: res.violations.length,
            violations: res.violations.map((v) => ({
                path: v.path,
                key: v.key,
                expected: v.expected,
            })),
        };
    };

    const canonical = buildArtifact(result.canonical, result.canonicalResult, "PascalCase");
    const compat = buildArtifact(result.compat, result.compatResult, "camelCase");
    const exitCode = canonical.ok && compat.ok && !canonical.parseError && !compat.parseError ? 0 : 1;

    return {
        name,
        skipped: false,
        missingArtifact: false,
        artifacts: { canonical, compat },
        exitCode,
    };
}

/* ----------------------------------------------------------------- */
/*  CLI argv parser. Accepts `--json` anywhere; positional arg is    */
/*  the project folder (same as before).                              */
/* ----------------------------------------------------------------- */
function parseArgs(argv) {
    const opts = { json: false, projectArg: null };
    for (const a of argv) {
        if (a === "--json") opts.json = true;
        else if (a === "--help" || a === "-h") opts.help = true;
        else if (!opts.projectArg) opts.projectArg = a;
    }
    return opts;
}

function main() {
    const { json: jsonMode, projectArg, help } = parseArgs(process.argv.slice(2));

    if (help) {
        process.stdout.write(
            `Usage: check-instruction-json-casing.mjs [--json] [<standalone-scripts/<name>>]\n` +
            `  --json   Emit a structured JSON report on stdout (suppresses text + ::error annotations).\n`,
        );
        process.exit(0);
    }

    let projects;
    if (projectArg) {
        const name = resolveProjectArg(projectArg);
        if (!name) {
            if (jsonMode) {
                process.stdout.write(JSON.stringify({
                    tool: "check-instruction-json-casing",
                    version: 1,
                    error: `Could not resolve project name from "${projectArg}"`,
                    exitCode: 2,
                    scannedProjects: 0,
                    projects: [],
                }) + "\n");
            } else {
                process.stderr.write(`✗ Could not resolve project name from "${projectArg}"\n`);
            }
            process.exit(2);
        }
        if (!existsSync(join(STANDALONE_DIR, name))) {
            if (jsonMode) {
                process.stdout.write(JSON.stringify({
                    tool: "check-instruction-json-casing",
                    version: 1,
                    error: `Project not found: standalone-scripts/${name}`,
                    exitCode: 2,
                    scannedProjects: 0,
                    projects: [],
                }) + "\n");
            } else {
                process.stderr.write(`✗ Project not found: standalone-scripts/${name}\n`);
            }
            process.exit(2);
        }
        projects = [name];
    } else {
        projects = listAllProjects();
        if (projects === null) {
            if (jsonMode) {
                process.stdout.write(JSON.stringify({
                    tool: "check-instruction-json-casing",
                    version: 1,
                    error: `standalone-scripts/ not found at ${rel(STANDALONE_DIR)}`,
                    exitCode: 2,
                    scannedProjects: 0,
                    projects: [],
                }) + "\n");
            } else {
                process.stderr.write(`✗ standalone-scripts/ not found at ${rel(STANDALONE_DIR)} — repo layout broken?\n`);
            }
            process.exit(2);
        }
    }

    // ── JSON mode: build the report silently, then emit once. ──────
    if (jsonMode) {
        const entries = [];
        let worst = 0;
        let scanned = 0;
        for (const name of projects) {
            const result = checkProject(name);
            const entry = buildJsonProjectEntry(name, result);
            if (!entry.skipped) scanned++;
            if (entry.exitCode > worst) worst = entry.exitCode;
            entries.push(entry);
        }
        const report = {
            tool: "check-instruction-json-casing",
            version: 1,
            scannedProjects: scanned,
            exitCode: worst,
            projects: entries,
        };
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        process.exit(worst);
    }

    // ── Default text mode: per-project logs + ::error annotations. ─
    let worst = 0;
    let scanned = 0;
    for (const name of projects) {
        const result = checkProject(name);
        const code = reportProject(name, result);
        if (!result.skipped) scanned++;
        if (code > worst) worst = code;
    }

    if (worst === 0) {
        console.log(`\n✅ check-instruction-json-casing — ${scanned} project(s) passed both shape checks`);
    } else {
        process.stderr.write(`\n❌ check-instruction-json-casing — failed (exit ${worst})\n`);
        process.stderr.write(`  See: mem://standards/pascalcase-json-keys, mem://architecture/instruction-dual-emit-phase-2b.md\n\n`);
    }
    process.exit(worst);
}


main();
