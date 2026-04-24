#!/usr/bin/env node
/**
 * check-pascalcase-instruction-migration.mjs
 *
 * Phase 2 PascalCase migration — fast-fail CI guard.
 *
 * The PascalCase migration of the instruction manifest (canonical
 * `dist/instruction.json` is pure PascalCase; `dist/instruction.compat.json`
 * is the transitional camelCase snapshot) only protects us if every
 * runtime consumer reads the canonical file with PascalCase keys. If a
 * single consumer silently slides back to a camelCase property read, the
 * canonical file's pure-PascalCase shape will return `undefined` at
 * runtime — usually masked by `?? defaults` / `?? []` and only surfaced
 * weeks later as a missing script, missing CSS, or empty config injection.
 *
 * This script enforces THREE things, all in one pass, with zero deps:
 *
 *   CHECK A — every `standalone-scripts/<name>/src/instruction.ts`
 *             contains ONLY PascalCase object-literal keys (or
 *             string-literal keys that are themselves PascalCase or
 *             intentionally-lowercase config-binding identifiers).
 *
 *   CHECK B — `instruction.compat.json` is read ONLY from the
 *             documented allowlist. Today that allowlist contains a
 *             single file: `vite.config.extension.ts` (the
 *             copyProjectScripts plugin). Phase 2c will remove that
 *             reader and this allowlist entry will be deleted; the
 *             checker will then enforce zero compat readers anywhere.
 *
 *   CHECK C — every file that reads the CANONICAL `instruction.json`
 *             (i.e. references the literal string `instruction.json`
 *             but NOT `instruction.compat.json`) must use PascalCase
 *             property access on the parsed result. We grep that file
 *             for distinctive camelCase instruction keys
 *             (`schemaVersion`, `displayName`, `loadOrder`, `runAt`,
 *             `targetUrls`, `configBinding`, `themeBinding`, `isIife`,
 *             `injectAs`, `matchType`, `cookieBinding`, `seedOnInstall`,
 *             `isRemovable`, `autoInject`, `configSeedIds`) — these
 *             names DO appear in the storage layer (StoredScript /
 *             StoredProject rows), so we ONLY flag occurrences that
 *             coexist with an `instruction.json` reference, which is
 *             the strong signal of an instruction-tree access.
 *
 * Exit codes:
 *   0 — all three checks passed
 *   1 — one or more violations (full report printed; emits GitHub
 *       Actions `::error file=…,line=…::` annotations on every
 *       offending line so PR reviewers see them inline)
 *   2 — repository structure not as expected (e.g. no
 *       standalone-scripts/, no .git context) — surfaces a setup
 *       problem instead of a false pass.
 *
 * Resolves: PascalCase instruction migration enforcement gate.
 *           Wired into `.github/workflows/ci.yml` as a preflight job
 *           and into the `build-extension` job's `needs:` so a
 *           regression cannot reach main.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const STANDALONE_DIR = resolve(REPO_ROOT, "standalone-scripts");

/* ----------------------------------------------------------------- */
/*  Allowlist for CHECK B — files permitted to read compat.json.     */
/*                                                                    */
/*  Phase 2b: vite.config.extension.ts (copyProjectScripts plugin).   */
/*  Phase 2c: this list MUST be empty. When you migrate the plugin,  */
/*  delete the entry below and the checker becomes a hard zero-tol   */
/*  guard against any compat reader anywhere.                         */
/* ----------------------------------------------------------------- */
const COMPAT_READER_ALLOWLIST = new Set([
    "vite.config.extension.ts",
    // Build-tooling files that legitimately reference the literal
    // string `instruction.compat.json` for emit/copy/dist-check
    // purposes — they don't *consume* the camelCase keys, they just
    // know the filename. Keeping these explicit so the checker stays
    // a tight zero-tolerance guard for actual readers.
    "scripts/compile-instruction.mjs",
    "scripts/check-standalone-dist.mjs",
    "scripts/generate-seed-manifest.mjs",
    "scripts/check-pascalcase-instruction-migration.mjs",
]);

/* ----------------------------------------------------------------- */
/*  Distinctive camelCase keys to scan for in CHECK C.               */
/*                                                                    */
/*  Each key name here is one whose camelCase ↔ PascalCase forms     */
/*  differ AND that appears as an instruction-tree property. Generic */
/*  identifiers shared with the storage layer (`cookies`,            */
/*  `dependencies`, `description`) are intentionally NOT in this     */
/*  list — they would produce constant false positives in            */
/*  StoredScript / StoredProject row code.                            */
/*                                                                    */
/*  CHECK C only fires this list against files that ALSO reference   */
/*  the literal string `instruction.json` (not the compat variant),  */
/*  so the storage-layer false-positive surface is collapsed to ~0.  */
/* ----------------------------------------------------------------- */
const LEGACY_CAMEL_KEYS = [
    "schemaVersion",
    "displayName",
    "loadOrder",
    "runAt",
    "targetUrls",
    "configBinding",
    "themeBinding",
    "isIife",
    "injectAs",
    "matchType",
    "cookieBinding",
    "seedOnInstall",
    "isRemovable",
    "autoInject",
    "configSeedIds",
];

/* ----------------------------------------------------------------- */
/*  Source dirs to scan for CHECK B and CHECK C.                     */
/* ----------------------------------------------------------------- */
const SCAN_DIRS = ["src", "scripts", "standalone-scripts"];
const SCAN_EXTS = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs"]);
const ROOT_FILES_TO_SCAN = ["vite.config.extension.ts"];

/* ----------------------------------------------------------------- */
/*  Helpers                                                           */
/* ----------------------------------------------------------------- */
const rel = (p) => relative(REPO_ROOT, p) || p;

/** Recursively list files under `dir` matching SCAN_EXTS. */
function listSourceFiles(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    const stack = [dir];
    while (stack.length > 0) {
        const cur = stack.pop();
        let entries;
        try {
            entries = readdirSync(cur);
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry === "node_modules" || entry === "dist" || entry === ".cache" || entry.startsWith(".")) continue;
            const full = join(cur, entry);
            let st;
            try {
                st = statSync(full);
            } catch {
                continue;
            }
            if (st.isDirectory()) {
                stack.push(full);
            } else if (SCAN_EXTS.has(extOf(entry))) {
                out.push(full);
            }
        }
    }
    return out;
}

function extOf(name) {
    const i = name.lastIndexOf(".");
    return i === -1 ? "" : name.slice(i);
}

/** Emit a GitHub Actions error annotation. */
function annotate(file, line, msg) {
    process.stdout.write(`::error file=${file},line=${line}::${msg}\n`);
}

/* ----------------------------------------------------------------- */
/*  CHECK A — instruction.ts source files are pure PascalCase.       */
/*                                                                    */
/*  Strategy: lift every object-literal KEY appearing in the source  */
/*  via a regex that matches `<ident>:` (or `"<ident>":`) at object  */
/*  positions. Keys are valid if they:                                */
/*    1. Start with an uppercase letter (PascalCase), OR              */
/*    2. Are entirely lowercase config-binding identifiers explicitly */
/*       allowed (e.g. `config`, `theme` — these are user-chosen     */
/*       binding NAMES inside `ConfigSeedIds`, not schema keys).      */
/*                                                                    */
/*  Anything else (e.g. `schemaVersion`, `displayName`, `loadOrder`)  */
/*  fails the check with a precise file:line annotation.              */
/* ----------------------------------------------------------------- */

/** Identifiers that may appear as lowercase keys in instruction.ts. */
const LOWERCASE_KEY_ALLOWLIST = new Set([
    "config",   // ConfigSeedIds.config: "default-macro-looping-config"
    "theme",    // ConfigSeedIds.theme:  "default-macro-theme"
]);

/** Strip JS/TS comments (line + block) so they don't trip the key regex. */
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1 + "");
}

function checkInstructionSource(file) {
    const violations = [];
    const raw = readFileSync(file, "utf-8");
    const src = stripComments(raw);

    // Locate the `const instruction ... = { ... };` block. Outside
    // this block, identifiers like `type MacroControllerSettings = {
    // IsolateScripts: boolean }` are TYPE definitions whose property
    // names follow the SAME PascalCase rule, so we scan the whole
    // file — not just the literal — to also catch type-side drift.
    const lines = src.split("\n");
    // Match `Key:` or `"Key":` at start of (whitespace) line. Excludes
    // ternary `? :` and labelled-statement-style usages by requiring
    // an identifier-only LHS.
    const KEY_RE = /^\s*(?:"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))\s*\??\s*:/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip TS import / export-from / type-import lines and `case`/`default:` labels.
        if (/^\s*(import|export\s+(type\s+)?\{|export\s+\*|case\s+|default\s*:)/.test(line)) continue;
        // Skip `interface X {` / `type X = {` opener lines (the brace
        // contains keys we DO want to check on subsequent lines, but
        // the opener itself has no key).
        const m = line.match(KEY_RE);
        if (!m) continue;
        const key = m[1] ?? m[2];
        if (!key) continue;

        // Reserved TS / JS keywords used as labels — never instruction keys.
        if (["return", "yield", "await", "throw", "break", "continue", "if", "else", "for", "while", "do", "switch", "try", "catch", "finally", "function", "const", "let", "var", "type", "interface", "enum", "import", "export", "from", "as", "new", "in", "of", "typeof", "instanceof", "void", "this", "super", "null", "true", "false", "undefined", "default"].includes(key)) {
            continue;
        }

        const firstChar = key[0];
        const isPascal = firstChar >= "A" && firstChar <= "Z";
        const isLowercaseAllowed = LOWERCASE_KEY_ALLOWLIST.has(key);
        if (isPascal || isLowercaseAllowed) continue;

        violations.push({
            file: rel(file),
            line: i + 1,
            key,
            snippet: line.trim(),
        });
    }
    return violations;
}

function runCheckA() {
    const violations = [];
    if (!existsSync(STANDALONE_DIR)) {
        process.stderr.write(`✗ standalone-scripts/ not found at ${rel(STANDALONE_DIR)} — repo layout broken?\n`);
        process.exit(2);
    }

    const projects = readdirSync(STANDALONE_DIR).filter((name) => {
        const full = join(STANDALONE_DIR, name);
        try {
            return statSync(full).isDirectory();
        } catch {
            return false;
        }
    });

    for (const proj of projects) {
        const tsPath = join(STANDALONE_DIR, proj, "src", "instruction.ts");
        if (!existsSync(tsPath)) continue;
        violations.push(...checkInstructionSource(tsPath));
    }

    if (violations.length === 0) {
        console.log(`✓ CHECK A — all instruction.ts sources use PascalCase keys (${projects.length} projects scanned)`);
        return 0;
    }

    process.stderr.write(`\n✗ CHECK A — ${violations.length} non-PascalCase instruction key(s) found:\n\n`);
    for (const v of violations) {
        process.stderr.write(`  ${v.file}:${v.line}  →  "${v.key}"\n`);
        process.stderr.write(`    ${v.snippet}\n`);
        annotate(v.file, v.line, `Instruction key "${v.key}" must be PascalCase (Phase 2a). Rename to "${v.key[0].toUpperCase()}${v.key.slice(1)}".`);
    }
    process.stderr.write(`\n  Fix: rename each key to PascalCase in the source instruction.ts.\n`);
    process.stderr.write(`  See: mem://standards/pascalcase-json-keys, mem://architecture/instruction-dual-emit-phase-2b.md\n\n`);
    return 1;
}

/* ----------------------------------------------------------------- */
/*  CHECK B — only allowlisted files may read instruction.compat.json */
/* ----------------------------------------------------------------- */
function runCheckB(sourceFiles) {
    const COMPAT_LITERAL = "instruction.compat.json";
    const violations = [];
    for (const file of sourceFiles) {
        const relPath = rel(file);
        const text = readFileSync(file, "utf-8");
        if (!text.includes(COMPAT_LITERAL)) continue;
        if (COMPAT_READER_ALLOWLIST.has(relPath)) continue;
        // Find every line referencing the literal so the annotation lands precisely.
        // Skip pure-comment mentions — comments don't read the file.
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].includes(COMPAT_LITERAL)) continue;
            const trimmed = lines[i].trimStart();
            if (
                trimmed.startsWith("//")
                || trimmed.startsWith("*")
                || trimmed.startsWith("/*")
            ) continue;
            violations.push({ file: relPath, line: i + 1, snippet: lines[i].trim() });
        }
    }

    if (violations.length === 0) {
        console.log(`✓ CHECK B — only allowlisted files reference instruction.compat.json`);
        return 0;
    }

    process.stderr.write(`\n✗ CHECK B — ${violations.length} unauthorized reference(s) to instruction.compat.json:\n\n`);
    for (const v of violations) {
        process.stderr.write(`  ${v.file}:${v.line}\n    ${v.snippet}\n`);
        annotate(v.file, v.line, `Reading instruction.compat.json is restricted to the documented allowlist. Migrate this consumer to the canonical PascalCase instruction.json instead.`);
    }
    process.stderr.write(`\n  Allowlist (Phase 2b): ${[...COMPAT_READER_ALLOWLIST].join(", ")}\n`);
    process.stderr.write(`  Fix: read instruction.json with PascalCase keys, OR add a justification + this file to COMPAT_READER_ALLOWLIST in scripts/check-pascalcase-instruction-migration.mjs (rare — the goal is zero entries by Phase 2c).\n\n`);
    return 1;
}

/* ----------------------------------------------------------------- */
/*  CHECK C — files that read instruction.json must use PascalCase   */
/*           property access (no legacy camelCase keys).              */
/* ----------------------------------------------------------------- */

/**
 * Variable-name allowlist that strongly indicates a binding holds the
 * parsed instruction.json tree. CHECK C only flags legacy camelCase
 * accesses where the receiver matches one of these names. This prunes
 * false positives from the storage layer (`meta.loadOrder` on a
 * BUILTIN_DIST_MAP entry, `script.runAt` on a StoredScript row, …)
 * which legitimately use the same property names as persistence keys.
 *
 * Add a name here only when it provably refers to a parsed
 * instruction.json result (i.e. it was assigned from `JSON.parse(...)`,
 * `await fetch(...).json()`, or `await fetchInstruction(...)`).
 */
const INSTRUCTION_RECEIVER_NAMES = [
    "instruction",
    "instructions",
    "instructionJson",
    "instructionManifest",
    "instructionTree",
    "manifest",
    "projectInstruction",
];

function runCheckC(sourceFiles) {
    const violations = [];
    // Match `<receiver>.<camelKey>` or `<receiver>["camelKey"]`. Allow
    // optional-chaining (`instruction?.assets`) between receiver and
    // accessor by tolerating an optional `?` immediately after the
    // receiver name.
    const KEY_GROUP = LEGACY_CAMEL_KEYS.join("|");
    const RECV_GROUP = INSTRUCTION_RECEIVER_NAMES.join("|");
    const ACCESS_RE = new RegExp(
        `\\b(${RECV_GROUP})\\??(?:\\.(${KEY_GROUP})\\b|\\[\\s*["'](${KEY_GROUP})["']\\s*\\])`,
        "g",
    );

    for (const file of sourceFiles) {
        const relPath = rel(file);
        // Self + dual-emit pipeline + compat-allowlisted readers are
        // exempt — they spell these names intentionally (in docs,
        // migration code, or against the camelCase compat snapshot).
        if (
            relPath === "scripts/check-pascalcase-instruction-migration.mjs"
            || relPath === "scripts/compile-instruction.mjs"
            || COMPAT_READER_ALLOWLIST.has(relPath)
        ) continue;

        const text = readFileSync(file, "utf-8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const ln = lines[i];
            const trimmed = ln.trimStart();
            if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

            ACCESS_RE.lastIndex = 0;
            let m;
            while ((m = ACCESS_RE.exec(ln)) !== null) {
                const recv = m[1];
                const key = m[2] ?? m[3];
                violations.push({
                    file: relPath,
                    line: i + 1,
                    receiver: recv,
                    key,
                    pascal: key[0].toUpperCase() + key.slice(1),
                    snippet: ln.trim(),
                });
            }
        }
    }

    if (violations.length === 0) {
        console.log(`✓ CHECK C — every instruction.json reader uses PascalCase property access`);
        return 0;
    }

    process.stderr.write(`\n✗ CHECK C — ${violations.length} legacy camelCase property access(es) on instruction-tree receivers:\n\n`);
    for (const v of violations) {
        process.stderr.write(`  ${v.file}:${v.line}  →  ${v.receiver}.${v.key}  (use ${v.receiver}.${v.pascal})\n    ${v.snippet}\n`);
        annotate(v.file, v.line, `Legacy camelCase access "${v.receiver}.${v.key}" on instruction-tree receiver. Use "${v.receiver}.${v.pascal}" — canonical instruction.json is pure PascalCase (Phase 2b).`);
    }
    process.stderr.write(`\n  Fix: rename each access to PascalCase. If "${"<receiver>"}" is NOT actually an instruction.json result (e.g. it's a StoredScript / StoredProject storage row), rename the local variable so it doesn't collide with INSTRUCTION_RECEIVER_NAMES in scripts/check-pascalcase-instruction-migration.mjs.\n\n`);
    return 1;
}

/* ----------------------------------------------------------------- */
/*  Main                                                              */
/* ----------------------------------------------------------------- */
function main() {
    const sourceFiles = [];
    for (const dir of SCAN_DIRS) {
        sourceFiles.push(...listSourceFiles(resolve(REPO_ROOT, dir)));
    }
    for (const f of ROOT_FILES_TO_SCAN) {
        const full = resolve(REPO_ROOT, f);
        if (existsSync(full)) sourceFiles.push(full);
    }

    console.log(`PascalCase instruction migration check — scanning ${sourceFiles.length} source file(s)\n`);
    const a = runCheckA();
    const b = runCheckB(sourceFiles);
    const c = runCheckC(sourceFiles);

    const failed = a + b + c;
    if (failed === 0) {
        console.log(`\n✅ All PascalCase instruction migration checks passed.`);
        process.exit(0);
    }
    process.stderr.write(`\n❌ ${failed} of 3 PascalCase instruction migration check(s) failed. See annotations above.\n`);
    process.exit(1);
}

main();
