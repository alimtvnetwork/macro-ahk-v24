# Generic Chrome Extension Blueprint — README

**Version:** 1.4.0
**Updated:** 2026-04-24
**Status:** Active
**AI Confidence:** Production-Ready (intent) / Medium (body — some sections still placeholders)
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## What this is

A **drop-in, AI-portable foundation** for building production-quality Chrome MV3 extensions. Any AI agent (or human) who reads only this folder can scaffold, build, lint, package, and ship an extension without referring to any other project, codebase, or memory.

---

## Quick start for AI agents

### 1. Open the onboarding prompt

**File:** `13-ai-onboarding-prompt.md`

This is the **single entry point**. It contains:

- **The one-prompt instruction** — a copy-verbatim block you paste into a fresh AI session.
- **Five required input tokens** — `<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>` — that the human must supply.
- **Eight operating rules** — sequential execution, templates-as-law, zero warnings, CODE-RED enforcement, no-retry policy, dark-only theme, and mandatory verification.
- **The 10-step build checklist** — the exact order of operations from scaffold → tokenise → install → lint → AppError → platform adapter → message relay → storage → UI shells → build/package.

### 2. Follow the 10-step checklist

Each step in `13-ai-onboarding-prompt.md` lists:

| Step | What you do | Source of truth | Verification command |
|------|-------------|-----------------|----------------------|
| 1 | Scaffold repository layout | `02-folder-and-build/01-repository-layout.md` | `tree -L 3 -I node_modules` |
| 2 | Copy & tokenise templates | `12-templates/00-overview.md` + all `*.template.*` | `rg "<(PROJECT_NAME\|ROOT_NAMESPACE\|VERSION\|HOST_MATCHES\|EXTENSION_ID)>" -l` returns empty |
| 3 | Install dependencies | `02-folder-and-build/05-package-json-scripts.md` | `npm ls --depth=0` |
| 4 | Wire TS + ESLint (zero warnings) | `03-typescript-and-linter/` | `npm run lint` (0 warnings, 0 errors); `npm run typecheck` |
| 5 | Implement `AppError` + logger | `07-error-management/` | `npm test -- error-codes` passes; `rg "throw new Error"` returns empty |
| 6 | Implement platform adapter | `04-architecture/04-platform-adapter.md` | `rg "\\bchrome\\." src/ -g '!src/platform/**'` returns empty |
| 7 | Implement message relay | `04-architecture/03-message-relay.md` | `npm test -- messaging` passes |
| 8 | Implement storage tier(s) | `05-storage-layers/` | `npm test -- storage` passes; `npm run check:codered` exits zero |
| 9 | Build UI shells | `06-ui-and-design-system/` | `rg "#[0-9a-fA-F]{3,8}\\b" src/ -g '!**/*.css'` returns empty |
| 10 | Build, package, verify | `11-cicd-and-release/` | `npm run validate && npm run lint && npm run typecheck && npm test && npm run build && npm run package` all pass; Chrome load-unpacked works |

### 3. Read sub-folders in numeric order

The 11 numbered sections (`02` through `12`) are **dependency-ordered**. Read them sequentially — each builds on the previous.

---

## Folder map

| # | Folder | What's inside |
|---|--------|---------------|
| `00` | `00-overview.md` | This README — index, scoring, how to use |
| `01` | `01-fundamentals.md` | MV3 invariants, lifecycle, boundaries |
| `02` | `02-folder-and-build/` | Repository layout, tsconfig matrix, Vite, manifest, packaging |
| `03` | `03-typescript-and-linter/` | Strict TS, ESLint flat-config, naming, zero-warnings policy |
| `04` | `04-architecture/` | Lifecycle, three-world model, message relay, namespace system, injection pipeline |
| `05` | `05-storage-layers/` | SQLite + IndexedDB + chrome.storage + localStorage tiers |
| `06` | `06-ui-and-design-system/` | Design tokens, dark-only theme, component library, controller UI, notifications |
| `07` | `07-error-management/` | AppError model, error code registry, file-path CODE-RED rule, logger |
| `08` | `08-auth-and-tokens/` | Bearer-token bridge, readiness gate, no-retry policy, host-permission failures |
| `09` | `09-injection-and-host-access/` | Permissions, restricted schemes, tab eligibility, cooldowns, token seeder |
| `10` | `10-testing-and-qa/` | Vitest, Playwright MV3, snapshot testing, non-regression rules |
| `11` | `11-cicd-and-release/` | Validation scripts, version policy, release ZIP contract |
| `12` | `12-templates/` | Copy-paste ready manifests, tsconfigs, vite/eslint configs, etc. |
| `13` | `13-ai-onboarding-prompt.md` | **Single prompt + 10-step checklist for a fresh AI** |
| `97` | `97-acceptance-criteria.md` | ~65 testable acceptance criteria |
| `98` | `98-changelog.md` | Version history |
| `99` | `99-consistency-report.md` | Structural health report |

---

## For humans: one-minute summary

If you want a new Chrome extension built from this blueprint, do this:

1. **Open `13-ai-onboarding-prompt.md`**.
2. **Fill in the five tokens** at the bottom of the one-prompt instruction (`<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>`).
3. **Copy the entire one-prompt block** and paste it into any AI coding assistant (Claude, GPT-4, Cursor, etc.).
4. **The AI follows the 10-step checklist** inside that same file. Each step has a verification command — the AI runs it and confirms it passes before continuing.
5. **At step 10**, the AI builds a ZIP you load into Chrome via `chrome://extensions → Load unpacked`.

That's it. The AI never needs to ask you questions unless a verification fails or a token is missing.

---

## Where the 10-step checklist lives

**File:** `13-ai-onboarding-prompt.md`

**Anchor:** `## The 10-Step Build Checklist` (line ~118)

**What it covers:** Steps 1–10 span from repository scaffolding through build, package, and Chrome load-unpacked verification. Each step includes a source-of-truth reference, detailed instructions, and a mandatory verification command.

**Ends at:** `## Stop conditions` (line ~285) — the section immediately following the checklist that defines the four situations when the AI may stop and ask for human guidance.

**Excerpt:**

> ### Step 1 — Scaffold the repository layout
> **Source of truth:** `02-folder-and-build/01-repository-layout.md`
> Create the project root, all sub-folders (`src/`, `src/background/`, `src/content/`, `src/options/`, `src/popup/`, `src/sdk/`, `src/messaging/`, `src/storage/`, `src/auth/`, `src/types/`, `src/config/`, `tests/`, `scripts/`, `public/`), and empty `.gitkeep` files where the spec requires.
> **Verification:** `tree -L 3 -I node_modules` matches the layout diagram in `02-folder-and-build/01-repository-layout.md`.
>
> [... Steps 2–9 ...]
>
> ### Step 10 — Build, package, and verify install
> **Source of truth:** `11-cicd-and-release/03-build-pipeline.md`, `11-cicd-and-release/04-release-zip-contract.md`, `02-folder-and-build/06-packaging-and-zip.md`
> Run `npm run validate`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run package`. Then in Chrome: open `chrome://extensions`, enable Developer Mode, click **Load unpacked** and select `dist/`. Confirm no errors badge, icon appears, popup shows dark shell, options page renders, background service worker is `active`.
> **Verification:** `npm run validate:zip` exits zero and the in-Chrome checklist passes.

---

## Cross-References

| Reference | Location |
|----------|----------|
| Spec authoring guide | `../01-spec-authoring-guide/00-overview.md` |
| TypeScript standards | `../02-coding-guidelines/02-typescript/00-overview.md` |
| Error management foundations | `../03-error-manage/00-overview.md` |
| Database conventions | `../04-database-conventions/00-overview.md` |
| Design system foundations | `../07-design-system/00-overview.md` |

---

## Troubleshooting FAQ — checklist verification failures

The 10-step checklist in `13-ai-onboarding-prompt.md` has a verification command after every step. When one fails, use this guide before asking for help.

### Step 2 — token substitution still shows unmatched tokens

**Symptom:** `rg "<(PROJECT_NAME|ROOT_NAMESPACE|VERSION|HOST_MATCHES|EXTENSION_ID)>" -l` returns files.

**Fix:**
1. Re-run the substitution on every `.template.*` file before renaming.
2. Check for tokens inside comments or string literals you may have skipped.
3. Ensure the regex covers all five tokens — no abbreviations or alternate spellings.

### Step 4 — `npm run lint` shows warnings

**Symptom:** Lint exits non-zero or reports > 0 warnings.

**Fix:**
1. Do not add `// eslint-disable` comments. Fix the root cause.
2. If the warning is from a template file you haven't customised yet, the template itself may need a tweak — check `12-templates/00-overview.md` for known template issues.
3. Run `npm run lint -- --fix` only if the auto-fix does not introduce new warnings.

### Step 5 — `rg "throw new Error"` returns matches

**Symptom:** Bare `throw new Error(...)` still exists outside test files.

**Fix:**
1. Replace every bare `throw new Error` with `throw AppError.from(...)` or `AppError.fromFsFailure(...)` for file/path errors.
2. Check `src/` only — `tests/` and `scripts/` may use bare errors intentionally.
3. Re-run `rg "throw new Error" src/` to confirm zero matches.

### Step 6 — direct `chrome.*` API calls outside `src/platform/`

**Symptom:** `rg "\bchrome\." src/ -g '!src/platform/**'` returns matches.

**Fix:**
1. Move every direct `chrome.*` call into `src/platform/chrome-adapter.ts`.
2. Expose it through the `PlatformAdapter` interface in `src/platform/platform-adapter.ts`.
3. Replace the call site with an adapter method invocation.

### Step 8 — `npm run check:codered` fails

**Symptom:** The CODE-RED validator reports missing `path` or `missing` fields.

**Fix:**
1. Every FS / storage / DB / OPFS / IDB error must use `AppError.fromFsFailure({ path, missing, reason })`.
2. Check that `path` is the exact resource path, `missing` is a single token describing what was absent (e.g. `file`, `table`, `key`), and `reason` is a human-readable sentence.
3. Re-run `npm run check:codered` until it exits zero.

### Step 10 — Chrome `Load unpacked` shows errors

**Symptom:** The extension loads with a red error badge, or the popup/options page is blank.

**Fix:**
1. Check `chrome://extensions` for the error text. If it mentions CSP, verify `manifest.json` `content_security_policy` matches the Vite build output hashes.
2. If the popup is blank, open the popup's DevTools (right-click → Inspect) and check the Console for missing module errors — usually a path alias or import resolution issue.
3. If the options page fails, verify `src/options/options.html` points to the correct built JS/CSS paths.
4. If the background service worker shows errors, go to the extension's detail page → Service Worker → Inspect, and check for `AppError` or adapter initialization failures.

---

## Validate this README

Run these commands from the repository root to confirm every link, anchor, and checklist reference in this README is correct.

### 1. Verify the onboarding prompt file exists and contains the checklist anchor

```bash
# The file must exist
test -f spec/26-chrome-extension-generic/13-ai-onboarding-prompt.md && echo "PASS: file exists" || echo "FAIL: file missing"

# The checklist anchor must be present
grep -q "^## The 10-Step Build Checklist" spec/26-chrome-extension-generic/13-ai-onboarding-prompt.md && echo "PASS: checklist anchor found" || echo "FAIL: checklist anchor missing"

# The stop-conditions boundary must be present (marks checklist end)
grep -q "^## Stop conditions" spec/26-chrome-extension-generic/13-ai-onboarding-prompt.md && echo "PASS: stop-conditions boundary found" || echo "FAIL: stop-conditions boundary missing"
```

### 2. Verify every cross-referenced spec file exists

```bash
for f in \
  spec/26-chrome-extension-generic/00-overview.md \
  spec/26-chrome-extension-generic/01-fundamentals.md \
  spec/26-chrome-extension-generic/02-folder-and-build/01-repository-layout.md \
  spec/26-chrome-extension-generic/03-typescript-and-linter/01-typescript-rules.md \
  spec/26-chrome-extension-generic/03-typescript-and-linter/02-eslint-config.md \
  spec/26-chrome-extension-generic/03-typescript-and-linter/05-zero-warnings-policy.md \
  spec/26-chrome-extension-generic/04-architecture/02-three-world-model.md \
  spec/26-chrome-extension-generic/04-architecture/03-message-relay.md \
  spec/26-chrome-extension-generic/04-architecture/04-platform-adapter.md \
  spec/26-chrome-extension-generic/05-storage-layers/01-storage-tier-matrix.md \
  spec/26-chrome-extension-generic/06-ui-and-design-system/01-design-tokens.md \
  spec/26-chrome-extension-generic/06-ui-and-design-system/02-dark-only-theme.md \
  spec/26-chrome-extension-generic/07-error-management/01-error-model.md \
  spec/26-chrome-extension-generic/07-error-management/03-file-path-error-rule.md \
  spec/26-chrome-extension-generic/08-auth-and-tokens/03-no-retry-policy.md \
  spec/26-chrome-extension-generic/11-cicd-and-release/03-build-pipeline.md \
  spec/26-chrome-extension-generic/11-cicd-and-release/04-release-zip-contract.md \
  spec/26-chrome-extension-generic/12-templates/00-overview.md \
  spec/26-chrome-extension-generic/97-acceptance-criteria.md \
  spec/26-chrome-extension-generic/98-changelog.md \
  spec/26-chrome-extension-generic/99-consistency-report.md; do
  test -f "$f" && echo "PASS: $f" || echo "FAIL: $f MISSING"
done
```

### 3. Verify generification (zero project-specific identifiers)

```bash
# This must return ZERO hits (excluding this README's generification policy note)
rg -i 'riseup|marco|lovable|supabase' spec/26-chrome-extension-generic/ -g '!*/readme.md'
```

### 4. Verify all template files have token placeholders

```bash
# Every .template.* file must contain at least one of the five canonical tokens
for f in spec/26-chrome-extension-generic/12-templates/*.template.*; do
  if grep -qE '<(PROJECT_NAME|ROOT_NAMESPACE|VERSION|HOST_MATCHES|EXTENSION_ID)>' "$f"; then
    echo "PASS: $f has tokens"
  else
    echo "WARN: $f missing tokens (may be intentional)"
  fi
done
```

### Expected result

All `PASS` lines above should print. Any `FAIL` indicates a broken link, missing file, or stale reference in this README. Fix before using the blueprint.

---

## Generification policy

This folder MUST contain **zero** project-specific identifiers. Before
publishing any new content, run:

```bash
rg -i 'riseup|marco|lovable|supabase' spec/26-chrome-extension-generic/
```

The command MUST return zero hits (excluding this generification policy
note itself, which uses the names as forbidden examples).
