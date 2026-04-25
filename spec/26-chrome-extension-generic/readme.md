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

## Cross-References

| Reference | Location |
|----------|----------|
| Spec authoring guide | `../01-spec-authoring-guide/00-overview.md` |
| TypeScript standards | `../02-coding-guidelines/02-typescript/00-overview.md` |
| Error management foundations | `../03-error-manage/00-overview.md` |
| Database conventions | `../04-database-conventions/00-overview.md` |
| Design system foundations | `../07-design-system/00-overview.md` |

---

## Generification policy

This folder MUST contain **zero** project-specific identifiers. Before
publishing any new content, run:

```bash
rg -i 'riseup|marco|lovable|supabase' spec/26-chrome-extension-generic/
```

The command MUST return zero hits (excluding this generification policy
note itself, which uses the names as forbidden examples).
