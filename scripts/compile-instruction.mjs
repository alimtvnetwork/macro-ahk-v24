#!/usr/bin/env node
/**
 * compile-instruction.mjs
 *
 * Compiles a standalone script's instruction.ts → dist/instruction.json.
 * Uses TypeScript compiler API to evaluate the default export.
 *
 * Usage: node scripts/compile-instruction.mjs <script-folder-path>
 * Example: node scripts/compile-instruction.mjs standalone-scripts/macro-controller
 *
 * --- Phase 1 dual-emit (PascalCase canonical + camelCase compat) ---
 *
 * As of the PascalCase-keys migration (2026-04-25), every per-script
 * `instruction.ts` ships PascalCase keys (`Name`, `World`, `RunAt`,
 * `IsIife`, `TargetUrls`, …). The runtime + UI consumers are
 * scheduled to be rewritten in Phase 2 — until then, this compiler
 * walks the parsed object tree and emits BOTH the canonical
 * PascalCase keys AND legacy camelCase aliases on every object node,
 * so existing readers (background handlers, manifest-seeder, options
 * UI, etc.) keep working without changes.
 *
 * The dual-emit layer is removed in Phase 2c once `grep -rn
 * '\.world\|\.runAt\|\.isIife\|\.loadOrder\|\.displayName' src/` returns
 * zero hits on instruction-shaped objects.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * PascalCase → camelCase: lowercase the first character, leave the rest
 * untouched. Only applied to keys that genuinely need an alias (i.e.
 * keys whose first character is uppercase). Acronym-heavy keys
 * (`URL`, `XPaths`, `IsIife`) get their leading char lowercased only —
 * matching the legacy spelling already in the codebase.
 */
function toCamelCase(key) {
    if (!key || key[0] !== key[0].toUpperCase()) return key;
    return key[0].toLowerCase() + key.slice(1);
}

/**
 * Recursively walk `value` and, for every plain object node, add a
 * camelCase-aliased copy of every PascalCase-named key alongside the
 * original. Arrays are walked element-by-element. Non-object leaves
 * (strings, numbers, booleans, null, undefined) are returned as-is.
 *
 * Aliases point at the SAME (recursively aliased) sub-tree, so the
 * canonical PascalCase reader and the legacy camelCase reader see
 * identical data. Mutating either side is therefore unsafe — but the
 * compiled JSON is read-only at runtime.
 */
function addCamelCaseAliases(value) {
    if (Array.isArray(value)) {
        return value.map(addCamelCaseAliases);
    }
    if (value === null || typeof value !== "object") {
        return value;
    }
    const aliased = {};
    // First pass: recursively process every value.
    const processed = {};
    for (const [key, val] of Object.entries(value)) {
        processed[key] = addCamelCaseAliases(val);
    }
    // Second pass: emit canonical key + camelCase alias when needed.
    for (const [key, val] of Object.entries(processed)) {
        aliased[key] = val;
        const camel = toCamelCase(key);
        if (camel !== key && !(camel in processed)) {
            aliased[camel] = val;
        }
    }
    return aliased;
}

async function main() {
    const folderArg = process.argv[2];
    if (!folderArg) {
        console.error("Usage: node scripts/compile-instruction.mjs <script-folder>");
        process.exit(1);
    }

    const folder = resolve(ROOT, folderArg);
    const tsPath = join(folder, "src", "instruction.ts");
    const distDir = join(folder, "dist");
    const outPath = join(distDir, "instruction.json");

    if (!existsSync(tsPath)) {
        console.log(`ℹ No instruction.ts in ${folderArg}/src/ — skipping`);
        return;
    }

    // Read TypeScript source and extract the instruction object
    const source = readFileSync(tsPath, "utf-8");

    // Simple extraction: find the `const instruction: ... = { ... };` block
    // and evaluate it as a JS object literal
    const match = source.match(/const\s+instruction\s*(?::\s*[^=]+?)?\s*=\s*(\{[\s\S]*?\n\});/);
    if (!match) {
        console.error(`❌ Could not extract instruction object from ${tsPath}`);
        process.exit(1);
    }

    // Collect all top-level const declarations before the instruction object
    // so that variables like LOVABLE_BASE_URL are available during evaluation.
    const preambleLines = [];
    const lines = source.split("\n");
    for (const line of lines) {
        // Stop when we reach the instruction declaration
        if (/^\s*const\s+instruction\s*(?::\s*[^=]+?)?\s*=/.test(line)) break;
        // Capture simple const string/number assignments (strip TS type annotations)
        const constMatch = line.match(/^\s*(const\s+\w+)\s*(?::\s*\w+)?\s*=\s*(.+?);?\s*$/);
        if (constMatch) {
            preambleLines.push(`${constMatch[1]} = ${constMatch[2]};`);
        }
    }

    // Evaluate the object literal in a safe context with preamble variables
    const evalCode = preambleLines.join("\n") + "\nreturn (" + match[1] + ")";
    const obj = new Function(evalCode)();

    // Phase 1 dual-emit: add camelCase aliases on every object node.
    const dualEmit = addCamelCaseAliases(obj);

    mkdirSync(distDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(dualEmit, null, 2) + "\n", "utf-8");
    console.log(`✅ Compiled instruction.json → ${outPath}`);
}

main().catch((err) => {
    console.error("❌ compile-instruction failed:", err);
    process.exit(1);
});
