#!/usr/bin/env node
/**
 * generate-seed-manifest.mjs
 *
 * Scans all standalone-scripts/<name>/dist/instruction.json files (per-project
 * build outputs) and produces a single seed-manifest.json that the extension
 * seeder reads at runtime from the unpacked extension root.
 *
 * instruction.json is the SOLE source of truth — script-manifest.json
 * is no longer required.
 *
 * ── PascalCase storage layer (Phase 2c) ──
 *
 * The emitted seed-manifest.json uses PascalCase keys end-to-end,
 * matching `ProjectInstruction` / `SeedManifest` (TS type). The reader
 * below requires the input `instruction.json` to be the canonical
 * PascalCase artifact emitted by `scripts/compile-instruction.mjs`
 * (Phase 2b) — no camelCase fallback. The transitional
 * `instruction.compat.json` is consumed only by the vite copy plugin.
 *
 * SchemaVersion is pinned to 2: PascalCase rename. The runtime seeder
 * (`src/background/manifest-seeder.ts`) only accepts v2; v1
 * (camelCase) was removed alongside this script's compat read.
 *
 * Usage:
 *   node scripts/generate-seed-manifest.mjs [--out <path>]
 *
 * Default output: chrome-extension/projects/seed-manifest.json
 *   (the unpacked extension folder loaded into Chrome).
 * Also writes to: standalone-scripts/_generated/seed-manifest.json (for reference)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const STANDALONE_DIR = join(ROOT, "standalone-scripts");

/** Pinned to 2 when PascalCase rename landed (Phase 2a). v1 (camelCase)
 * is no longer emitted; v1 manifests are not accepted by the runtime
 * seeder either (see manifest-seeder.ts SUPPORTED_SCHEMA_VERSIONS). */
const SCHEMA_VERSION = 2;

/* ------------------------------------------------------------------ */
/*  Reader — PascalCase only                                            */
/*                                                                      */
/*  Phase 2c (storage layer) requires the input instruction.json to be  */
/*  the canonical PascalCase artifact emitted by compile-instruction.   */
/*  No camelCase fallback. A missing key is a hard error visible in the */
/*  build log; do NOT add `pick(obj, "Pascal", "camel")` lenience here. */
/* ------------------------------------------------------------------ */

/** Read a required PascalCase key. Throws with a precise location if missing/undefined. */
function need(obj, key, location) {
    if (!obj || typeof obj !== "object") {
        throw new Error(`[generate-seed-manifest] ${location}: expected object, got ${typeof obj}`);
    }
    if (!(key in obj) || obj[key] === undefined) {
        throw new Error(
            `[generate-seed-manifest] ${location}: missing required PascalCase key "${key}". ` +
            `Re-run \`node scripts/compile-instruction.mjs <project>\` to regenerate ` +
            `instruction.json from the source instruction.ts.`,
        );
    }
    return obj[key];
}

/** Read an optional PascalCase key. Returns the value or `fallback` (default undefined). */
function opt(obj, key, fallback = undefined) {
    if (!obj || typeof obj !== "object") return fallback;
    return key in obj && obj[key] !== undefined ? obj[key] : fallback;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

function main() {
    const outArg = process.argv.indexOf("--out");
    const defaultOut = join(ROOT, "chrome-extension", "projects", "seed-manifest.json");
    const outPath = outArg !== -1 ? resolve(process.argv[outArg + 1]) : defaultOut;


    if (!existsSync(STANDALONE_DIR)) {
        console.error("❌ standalone-scripts/ directory not found");
        process.exit(1);
    }

    const folders = readdirSync(STANDALONE_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith("_") && d.name !== "prompts");

    const projects = [];

    for (const folder of folders) {
        const name = folder.name;
        const projectDir = join(STANDALONE_DIR, name);
        const sourceInstructionPath = join(projectDir, "src", "instruction.ts");
        const instructionPath = join(STANDALONE_DIR, name, "dist", "instruction.json");

        ensureFreshInstructionJson(name, projectDir, sourceInstructionPath, instructionPath);

        if (!existsSync(instructionPath)) {
            console.warn(`⚠ Skipping ${name}: no dist/instruction.json (run compile-instruction first)`);
            continue;
        }

        const instruction = JSON.parse(readFileSync(instructionPath, "utf-8"));
        const projectEntry = buildProjectEntry(name, instruction);
        projects.push(projectEntry);
    }

    // Sort by LoadOrder (PascalCase)
    projects.sort((a, b) => a.LoadOrder - b.LoadOrder);

    const manifest = {
        GeneratedAt: new Date().toISOString(),
        SchemaVersion: SCHEMA_VERSION,
        Projects: projects,
    };

    const json = JSON.stringify(manifest, null, 2) + "\n";

    // Write to output path
    mkdirSync(resolve(outPath, ".."), { recursive: true });
    writeFileSync(outPath, json, "utf-8");
    console.log(`✅ seed-manifest.json → ${outPath} (${projects.length} projects, schema v${SCHEMA_VERSION})`);

    // Also write a reference copy alongside standalone-scripts
    const refDir = join(STANDALONE_DIR, "_generated");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(join(refDir, "seed-manifest.json"), json, "utf-8");
}

function ensureFreshInstructionJson(name, projectDir, sourceInstructionPath, instructionPath) {
    const sourceExists = existsSync(sourceInstructionPath);
    const distExists = existsSync(instructionPath);

    if (!sourceExists) {
        return;
    }

    const shouldCompile = !distExists || statSync(sourceInstructionPath).mtimeMs > statSync(instructionPath).mtimeMs;
    if (!shouldCompile) {
        return;
    }

    const relativeProjectDir = projectDir.replace(ROOT + "/", "");
    console.log(`↻ Refreshing stale instruction.json for ${name}`);
    execFileSync(process.execPath, [join(ROOT, "scripts", "compile-instruction.mjs"), relativeProjectDir], {
        cwd: ROOT,
        stdio: "inherit",
    });
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

function buildProjectEntry(name, instruction) {
    const basePath = `projects/scripts/${name}`;

    // Read seed block from instruction (the single source of truth).
    // Prefer PascalCase, fall back to legacy camelCase during migration.
    const seed = pick(instruction, "Seed", "seed") || {};
    const assets = pick(instruction, "Assets", "assets") || {};

    const displayName = pick(instruction, "DisplayName", "displayName") || name;
    const version = pick(instruction, "Version", "version") || "1.0.0";
    const description = pick(instruction, "Description", "description") || "";
    const world = pick(instruction, "World", "world") || "MAIN";
    const loadOrder = pick(instruction, "LoadOrder", "loadOrder") ?? 99;
    const isGlobal = pick(instruction, "IsGlobal", "isGlobal") === true;
    const dependencies = pick(instruction, "Dependencies", "dependencies") || [];

    const seedId = pick(seed, "Id", "id") || `default-${name}`;
    const seedOnInstall = pick(seed, "SeedOnInstall", "seedOnInstall") ?? true;
    const isRemovable = pick(seed, "IsRemovable", "isRemovable") ?? true;
    const seedRunAt = pick(seed, "RunAt", "runAt");
    const seedAutoInject = pick(seed, "AutoInject", "autoInject") ?? true;
    const seedCookieBinding = pick(seed, "CookieBinding", "cookieBinding");
    const configSeedIds = pick(seed, "ConfigSeedIds", "configSeedIds") || {};

    // Build script entries from Assets.Scripts
    const scripts = [];
    const scriptAssets = pick(assets, "Scripts", "scripts") || [];
    for (const s of scriptAssets) {
        scripts.push({
            SeedId: seedId,
            File: pick(s, "File", "file"),
            FilePath: `${basePath}/${pick(s, "File", "file")}`,
            Order: pick(s, "Order", "order") ?? 0,
            IsIife: pick(s, "IsIife", "isIife") ?? true,
            ConfigBinding: pick(s, "ConfigBinding", "configBinding"),
            ThemeBinding: pick(s, "ThemeBinding", "themeBinding"),
            CookieBinding: seedCookieBinding,
            RunAt: seedRunAt,
            Description: description,
            AutoInject: seedAutoInject,
        });
    }

    // Build config entries from Assets.Configs
    const configs = [];
    const configAssets = pick(assets, "Configs", "configs") || [];
    for (const c of configAssets) {
        const key = pick(c, "Key", "key");
        configs.push({
            SeedId: configSeedIds[key] || `default-${name}-${key}`,
            File: pick(c, "File", "file"),
            FilePath: `${basePath}/${pick(c, "File", "file")}`,
            Key: key,
            InjectAs: pick(c, "InjectAs", "injectAs"),
            Description: `${key} config for ${displayName}`,
        });
    }

    // Build CSS entries
    const cssAssets = pick(assets, "Css", "css") || [];
    const css = cssAssets.map(c => ({
        File: pick(c, "File", "file"),
        FilePath: `${basePath}/${pick(c, "File", "file")}`,
        Inject: pick(c, "Inject", "inject") || "head",
    }));

    // Build template entries
    const templateAssets = pick(assets, "Templates", "templates") || [];
    const templates = templateAssets.map(t => ({
        File: pick(t, "File", "file"),
        FilePath: `${basePath}/${pick(t, "File", "file")}`,
        InjectAs: pick(t, "InjectAs", "injectAs"),
    }));

    // Build prompt entries
    const promptAssets = pick(assets, "Prompts", "prompts") || [];
    const prompts = promptAssets.map(p => ({
        File: pick(p, "File", "file"),
        FilePath: `${basePath}/${pick(p, "File", "file")}`,
    }));

    // TargetUrls / Cookies / Settings — copy fields with PascalCase preference
    const targetUrlsRaw = pick(seed, "TargetUrls", "targetUrls") || [];
    const targetUrls = targetUrlsRaw.map(u => ({
        Pattern: pick(u, "Pattern", "pattern"),
        MatchType: pick(u, "MatchType", "matchType"),
    }));

    const cookiesRaw = pick(seed, "Cookies", "cookies") || [];
    const cookies = cookiesRaw.map(c => ({
        CookieName: pick(c, "CookieName", "cookieName"),
        Url: pick(c, "Url", "url"),
        Role: pick(c, "Role", "role"),
        Description: pick(c, "Description", "description"),
    }));

    const settings = pick(seed, "Settings", "settings") || {};

    return {
        Name: name,
        DisplayName: displayName,
        Version: version,
        Description: description,
        SeedId: seedId,
        SeedOnInstall: seedOnInstall,
        World: world,
        LoadOrder: loadOrder,
        IsGlobal: isGlobal,
        IsRemovable: isRemovable,
        Dependencies: dependencies,
        Scripts: scripts,
        Configs: configs,
        Css: css,
        Templates: templates,
        Prompts: prompts,
        TargetUrls: targetUrls,
        Cookies: cookies,
        Settings: settings,
    };
}

main();
