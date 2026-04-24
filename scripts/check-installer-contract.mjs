#!/usr/bin/env node
/**
 * check-installer-contract.mjs
 *
 * Drift detector for the shared installer contract.
 *
 * Verifies, in order:
 *   1. scripts/installer-constants.{sh,ps1} are byte-identical to a
 *      fresh re-generation from scripts/installer-contract.json. If
 *      not, someone edited the generated file by hand or forgot to
 *      regenerate after editing the contract.
 *   2. Every `exit <N>` literal in install.sh appears in the contract's
 *      exitCodes set.
 *   3. Every `exit <N>` literal in install.ps1 appears in the contract.
 *   4. Every long flag declared in install.sh (in the argparse case
 *      block) appears in the contract's flags map. Same for the
 *      PowerShell -Switch / -String parameters in install.ps1.
 *   5. The default repo strings hardcoded in install.sh and install.ps1
 *      either match the contract or are sourced from the contract via
 *      ${MARCO_DEFAULT_REPO:-…} / $script:MarcoDefaultRepo fallback.
 *
 * Exits 0 on success, 1 on any drift with a diff or list of offenders.
 *
 * Wire into CI alongside the existing check-* scripts.
 */
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { generateInstallerConstants } from "./generate-installer-constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONTRACT = JSON.parse(
    readFileSync(join(__dirname, "installer-contract.json"), "utf8"),
);
const SH_PATH = join(__dirname, "install.sh");
const PS1_PATH = join(__dirname, "install.ps1");
const SH_CONST = join(__dirname, "installer-constants.sh");
const PS1_CONST = join(__dirname, "installer-constants.ps1");

const errors = [];

// ── 1. Generated files in sync with contract ────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "installer-contract-"));
try {
    const fresh = generateInstallerConstants(tmp);
    const committedSh = readFileSync(SH_CONST, "utf8");
    const committedPs1 = readFileSync(PS1_CONST, "utf8");
    if (committedSh !== fresh.sh) {
        errors.push(
            "scripts/installer-constants.sh is OUT OF SYNC with installer-contract.json.\n" +
                "Run: node scripts/generate-installer-constants.mjs",
        );
    }
    if (committedPs1 !== fresh.ps1) {
        errors.push(
            "scripts/installer-constants.ps1 is OUT OF SYNC with installer-contract.json.\n" +
                "Run: node scripts/generate-installer-constants.mjs",
        );
    }
} finally {
    rmSync(tmp, { recursive: true, force: true });
}

// ── 2 & 3. exit code drift ──────────────────────────────────────────
const allowedExits = new Set(Object.keys(CONTRACT.exitCodes).map(Number));
const sh = readFileSync(SH_PATH, "utf8");
const ps1 = readFileSync(PS1_PATH, "utf8");

function checkExits(file, source) {
    const re = /(?:^|[^\w])exit\s+(\d+)\b/g;
    const offenders = new Set();
    let m;
    while ((m = re.exec(source)) !== null) {
        const code = Number(m[1]);
        if (!allowedExits.has(code)) offenders.add(code);
    }
    if (offenders.size) {
        errors.push(
            `${file} exits with codes not declared in installer-contract.json: ${[...offenders].join(", ")}`,
        );
    }
}
checkExits("install.sh", sh);
checkExits("install.ps1", ps1);

// ── 4. flag drift ───────────────────────────────────────────────────
const declaredLongFlags = new Set(
    Object.values(CONTRACT.flags)
        .map((f) => f.long)
        .filter(Boolean),
);
const declaredPsFlags = new Set(
    Object.values(CONTRACT.flags)
        .map((f) => f.powershell)
        .filter(Boolean),
);

// install.sh: pull the argparse case block (between "while [[ $# -gt 0" and "esac")
const shFlagRe = /\b(--[a-z][a-z0-9-]*)\)/g;
const shFlags = new Set();
let fm;
while ((fm = shFlagRe.exec(sh)) !== null) shFlags.add(fm[1]);
// Reserved help/version aliases handled separately
const shUnknown = [...shFlags].filter((f) => !declaredLongFlags.has(f));
if (shUnknown.length) {
    errors.push(
        `install.sh accepts CLI flags missing from installer-contract.json: ${shUnknown.join(", ")}`,
    );
}

// install.ps1: scan the param() block for [switch]$Foo / [string]$Foo
const paramBlock = ps1.match(/param\s*\(([\s\S]*?)\)/);
if (paramBlock) {
    const psParamRe = /\[(?:switch|string|int|bool)\]\$([A-Z][A-Za-z0-9]*)/g;
    const psFlags = new Set();
    let pm;
    while ((pm = psParamRe.exec(paramBlock[1])) !== null) {
        psFlags.add("-" + pm[1]);
    }
    const psUnknown = [...psFlags].filter((f) => !declaredPsFlags.has(f));
    if (psUnknown.length) {
        errors.push(
            `install.ps1 accepts parameters missing from installer-contract.json: ${psUnknown.join(", ")}`,
        );
    }
}

// ── 5. default repo consistency ─────────────────────────────────────
const expectedRepo = CONTRACT.repo.default;
const shRepoRe = /REPO="\$\{MARCO_DEFAULT_REPO:-([^}]+)\}"/;
const shMatch = sh.match(shRepoRe);
if (!shMatch) {
    errors.push(
        "install.sh no longer reads REPO via ${MARCO_DEFAULT_REPO:-…} — refusing to silently drift.",
    );
} else if (shMatch[1] !== expectedRepo) {
    errors.push(
        `install.sh fallback repo '${shMatch[1]}' != contract '${expectedRepo}'.`,
    );
}
if (!ps1.includes("$script:MarcoDefaultRepo")) {
    errors.push(
        "install.ps1 no longer references $script:MarcoDefaultRepo — refusing to silently drift.",
    );
}
const ps1FallbackRe = /\$script:MarcoDefaultRepo\s*=\s*'([^']+)'/g;
let pmRepo;
while ((pmRepo = ps1FallbackRe.exec(ps1)) !== null) {
    if (pmRepo[1] !== expectedRepo) {
        errors.push(
            `install.ps1 fallback repo '${pmRepo[1]}' != contract '${expectedRepo}'.`,
        );
    }
}

// ── Result ──────────────────────────────────────────────────────────
if (errors.length) {
    process.stderr.write(
        "✗ Installer contract drift detected:\n\n  - " +
            errors.join("\n  - ") +
            "\n",
    );
    process.exit(1);
}
process.stdout.write("✓ installer-contract.json in sync with install.sh + install.ps1\n");
