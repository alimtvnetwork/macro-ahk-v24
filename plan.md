# Automator — Future Work Roadmap

**Last Updated**: 2026-04-15
**Active Codebase**: `marco-script-ahk-v7.latest/` (v7.23)
**Macro Controller**: v2.139.0
**Chrome Extension**: v2.139.0
**Detailed Plan**: `.lovable/plan.md`
**Suggestions Tracker**: `.lovable/memory/suggestions/01-suggestions-tracker.md`
**Completed Plans**: `.lovable/memory/workflow/completed/`
**Issue Write-Ups**: `/spec/22-app-issues/`
**Risk Report**: `.lovable/memory/workflow/03-reliability-risk-report.md`

---

## 🆕 2026-04-24 — Project Import/Export E2E Audit (in progress)

**Spec**: `spec/30-import-export/` (3 docs: 01-rca, 02-erd, 03-test-plan).
**Diagrams**: `/mnt/documents/import-export-erd.mmd`, `/mnt/documents/import-export-flow.mmd`.
**Memory**: `.lovable/memory/architecture/project-import-export.md`, `.lovable/memory/architecture/prompt-pipeline.md`.

### Completed in this session
- ✅ Audited two parallel exporters; designated `src/lib/sqlite-bundle.ts` canonical, `src/lib/project-exporter.ts` deprecated.
- ✅ Documented real PascalCase SQLite schema (Projects/Scripts/Configs/Prompts/Meta) — does **not** match earlier user spec (no Dependencies/Variables/DatabaseInfo tables).
- ✅ Migrated all 14 `standalone-scripts/prompts/*/info.json` from camelCase to PascalCase keys.
- ✅ Updated `scripts/aggregate-prompts.mjs` to read PascalCase canonically with camelCase fallback + deprecation warning.
- ✅ Verified aggregator still produces 14 prompts (output shape unchanged).
- ✅ Wrote ERD + flow Mermaid diagrams for user review.

### Pending — triggered when user replies "next"
1. **E2E test suite** (12 files, ≈67 tests) — setup-once + parallel asserts. Layout in `spec/30-import-export/03-test-plan.md` §3.
2. **CI job** `import-export-e2e` runs after `derive-casing-matrix`, uploads bundle artifact on failure.

### Follow-ups (queued, not in current task)
1. Rewire `ProjectEditor.tsx` + `ProjectsSection.tsx` from `project-exporter.ts` → `exportProjectAsSqliteZip()`; delete the legacy file.
2. Promote `dependencies` and `variables` from JSON-blob to first-class PascalCase tables (`Dependencies`, `Variables`) with a `SchemaVersion` bump — requires migration.
3. Export `PromptsCategory` + `PromptsToCategory` to preserve multi-category prompt linkage (currently lossy — flattened to `Prompts.Category`).
4. Add explicit `ImportStrictPascalCase` flag and gate the snake_case/camelCase fallback readers in `sqlite-bundle.ts:371-372` etc. behind `legacy=true`.
5. Extend the existing `casing-instruction-json` CI job (or add a sibling) to validate `standalone-scripts/prompts/*/info.json` PascalCase compliance.

---

## Current Status: v7.23 AHK + Extension v2.139.0 + Macro Controller v2.139.0 — Stable

All critical AHK features implemented. 44 issue write-ups documented. 26 engineering standards established. Chrome Extension at v2.139.0 with full React UI unification, session-bridge auth (unified `getBearerToken()` contract), SQLite bundles, User Script API, Context Menu, relative scaling, view transitions, hover micro-interactions, 7-stage injection pipeline with cache gate, 4-tier CSP fallback, and Cross-Project Sync (Phase 1 data layer + Phase 2 Library UI). Macro Controller at v2.139.0 with typed namespace API, centralized constants (Phase 1+2), zero ESLint warnings, and all Supabase references purged. All immediate workstream items complete.

### 2026-04-12 Session

- **ESLint Zero-Warning Achievement**:
  - **`no-explicit-any` elimination**: Reduced from 548 → 0 violations across entire `src/` codebase. Replaced with `unknown`, typed generics, `Record<string, unknown>`, and explicit interfaces.
  - **`no-restricted-types` cleanup**: Resolved 326 warnings for legitimate `unknown` boundary uses (catch clauses, `Record<string, unknown>`, type guards). Rule disabled globally as all uses were valid.
  - **Stale directive cleanup**: Removed 9 unused `eslint-disable` comments left over from type-safety improvements.
  - **Component splitting**: Extracted `useSchemaBuilder.ts` + `SchemaTableCard.tsx` from SchemaTab (548→155 lines), `useConfigDb.ts` + `ConfigSectionList.tsx` from ConfigDbTab (296→100 lines). Added targeted suppressions for 4 cohesive sub-components (GroupFormDialog, VersionRow, useLibraryLinkMap, ProjectEditor test).
  - **Final state**: 0 errors, 0 warnings across full `src/` ESLint SonarJS scan.

- **Test Suite Fix (21 → 0 failures)**:
  - Added missing `chrome.tabs.get()` to chrome mock — injection handler's early URL guard threw, returning empty results (14 failures).
  - Added missing `wakeBridge` to panel-builder auth mock (7 failures).
  - Added `setMockTabs` with required tab IDs in message-flow-integration injection flow `beforeEach` (1 failure).
  - **Final state**: 96 test files, 1080 tests — all passing.

### 2026-04-09 Session (continued)

- **Typed Namespace Refactor (v2.123.0)**:
  - Replaced dynamic `dualWrite`/`nsRead`/`nsCall` (string path + `split('.')` traversal) with compile-time typed `nsWrite<P>`/`nsReadTyped<P>`/`nsCallTyped<P>` backed by `NsPathMap` interface (30+ typed paths).
  - Eliminated all `Record<string, unknown>` casts from consumer call sites — cast is localized to single implementation function.
  - Dropped legacy `_windowKey` parameter from all call sites. Old functions kept as deprecated wrappers.
  - Updated 10 consumer files: `macro-looping.ts`, `startup.ts`, `credit-fetch.ts`, `loop-controls.ts`, `ui-updaters.ts`, `startup-idempotent-check.ts`, `startup-persistence.ts`, `startup-global-handlers.ts`, `panel-sections.ts`, `panel-controls.ts`, `menu-builder.ts`, `MacroController.ts`.
  - Fixed `sonarjs/cognitive-complexity` warning in `save-prompt.ts` by extracting `tryToolbarButtonFallback()` and `tryDirectFallback()`.
  - Fixed 9 migration bugs from T6: 4 broken `.catch(function)` calls, 2 broken import merges, 3 missing string quotes.

- **Constants Centralization Phase 1 (v2.124.0)**:
  - Created `constants.ts` — single source of truth for 56 hardcoded constants across 7 categories: DOM IDs (`ID_*`), CSS selectors (`SEL_*`), data attributes (`ATTR_*`), localStorage keys (`LS_*`), workspace/cache keys (`WS_*`), style IDs (`STYLE_*`), timing/limits, and shared strings.
  - Migrated 18 files to import from `constants.ts`. Eliminated 4 duplicate constant definitions (`ID_LOOP_WS_LIST`, `ATTR_DATA_ACTIVE`, `SEL_LOOP_WS_ITEM`, `MACRO_CONTROLLER`).
  - Moved 6 storage constants from `shared-state.ts` to `constants.ts` with re-exports for backward compatibility.
  - Config-derived runtime constants (`IDS`, `TIMING`, `CONFIG`) remain in `shared-state.ts` (resolved from `__MARCO_CONFIG__` at runtime).

- **Constants Centralization Phase 2 (v2.125.0)**:
  - Expanded `constants.ts` from 56 → 96 exported constants. Migrated 50 constants from 21 consumer files.
  - **CSS Fragments (21 constants)**: `CSS_SPAN_STYLE_COLOR`, `CSS_SPAN_COLOR` (deduplicated alias), `CSS_BAR_SEGMENT_TAIL`, `CSS_TRANSITION_TAIL`, `CSS_EASE_CLOSE`, `CSS_STYLE_WIDTH`, `CSS_BACKGROUND`, `CSS_FONT_SIZE`, `CSS_FONT_SIZE_9PX_COLOR`, `CSS_FONT_SIZE_11PX_FONT_WEIGHT_700_COLOR`, `CSS_BORDER_RADIUS_3PX_BACKGROUND`, `CSS_BORDER_1PX_SOLID_RGBA_255_255_255_0_08`, `CSS_PADDING_2PX_0`, `CSS_BORDER_PRIMARY`, `CSS_BORDER_PRIMARY_STRONG`, `CSS_BORDER_SOLID`, `CSS_LABEL_BLOCK`, `CSS_LABEL_SUFFIX`, `CSS_BORDER_RADIUS_COLOR`, `CSS_RGBA_124_58_237_0_15`, `CSS_WIDTH_100_PADDING_3PX_5PX_BORDER_1PX_SOL`, `CSS_BRIGHTNESS_1_3`.
  - **IndexedDB Constants (7)**: `DB_PROMPTS_CACHE_NAME`, `DB_PROMPTS_CACHE_VERSION`, `DB_PROMPTS_STORE`, `DB_PROMPTS_UI_STORE`, `DB_PROMPTS_JSON_COPY_KEY`, `DB_PROMPTS_HTML_COPY_KEY`, `DB_PROMPTS_UI_CACHE_KEY`.
  - **API Paths (2)**: `API_USER_WORKSPACES`, `API_USER_WORKSPACES_SLASH`.
  - **Timing/Limits (6)**: `DEFAULT_TOKEN_TTL_MS`, `MIN_CREDIT_CALL_GAP_MS`, `MAX_OVERLAY_ERRORS`, `MAX_SDK_ATTEMPTS`, `SDK_RETRY_DELAY_MS`, `MAX_UI_CREATE_RETRIES`.
  - **Storage Keys (2)**: `LS_TOKEN_SAVED_AT`, `LS_RENAME_PRESET_PREFIX`.
  - **Defaults (2)**: `DEFAULT_PRESET_NAME`, `DEFAULT_PASTE_XPATH`.
  - **Startup Labels (5)**: `LABEL_PROMPT_PREWARM`, `LABEL_WS_PREFETCH`, `LABEL_STARTUP_RETRY`, `LABEL_AUTH_AUTO_RESYNC`, `LABEL_LOG_MACROLOOP_V`.
  - **DOM IDs (1)**: `ID_MARCO_ERROR_OVERLAY`.
  - Consumer files updated: `credit-api.ts`, `log-activity-ui.ts`, `auth-recovery.ts`, `auth-resolve.ts`, `credit-balance.ts`, `credit-fetch.ts`, `rename-api.ts`, `workspace-rename.ts`, `startup.ts`, `startup-idempotent-check.ts`, and 11 UI modules (`js-executor`, `auth-diag-waterfall`, `bulk-rename-fields`, `hot-reload-section`, `panel-controls`, `panel-header`, `prompt-injection`, `save-prompt-task-next`, `settings-tab-panels`, `settings-ui`, `tools-sections-builder`, `prompt-cache`, `prompt-loader`, `error-overlay`).

### 2026-04-09 Session (earlier)

- **Error Logging Spec Implementation (T1–T5) — COMPLETE**:
  - **T1 — NamespaceLogger**: Created `marco-sdk/src/logger.ts` with `error()`, `warn()`, `info()`, `debug()`, `console()`, `stackTrace()` methods. Exposed on `RiseupAsiaMacroExt.Logger`. Always-capture stack traces via `captureStack()`.
  - **T2 — globals.d.ts typing**: Full `RiseupAsiaMacroExtNamespace` interface with typed `Logger` (6 methods), `Projects`, `RiseupAsiaProject`, `CookieBinding`, `MacroControllerNamespace` on `window`.
  - **T3 — Swallowed error fixes (S1–S16)**: All 16 swallowed errors across 8 files replaced with structured `NamespaceLogger.error()` calls including file path, missing item, and reasoning.
  - **T4 — `any` elimination**: All 11 `any` occurrences removed from `macro-controller/src/` (excluding `__tests__/`). Replaced with `unknown`, explicit types, or typed generics.
  - **T5 — Error-level log migration**: All 86 `log(msg, 'error')` calls migrated to `logError(fn, msg, error?)` across 33 files. Zero `log(*, 'error')` remaining.
- **Silent catch block fixes (48 blocks)**: All swallowed catch blocks in SDK + Controller now log via `logError()` + `showToast()` (controller) or `NamespaceLogger.error()` (SDK). Zero silent catches remaining.
- **Controller error-utils expansion**: Added `logDebug()`, `logConsole()`, `logStackTrace()` wrappers alongside `logError()`. Each delegates to `RiseupAsiaMacroExt.Logger` when available, falls back to console with `[RiseupAsia] [fn]` prefix.
- **API namespace explicit typing**: Replaced all `Record<string, unknown>` in `MacroControllerNamespace` with 8 explicit interfaces: `LoopApi`, `CreditsApi`, `AuthApi`, `WorkspaceApi`, `UiApi`, `ConfigApi`, `AutoAttachApi`, `MacroControllerInternal`. Zero `unknown` in API surface. `getNamespace()` uses typed casts instead of `Record<string, Record<string, unknown>>`.
- **SDK AuthTokenUtils extraction**: Moved pure token utilities from `macro-controller/src/auth-resolve.ts` to `marco-sdk/src/auth-token-utils.ts` as a static class. Exposed on `window.marco.authUtils`. Controller delegates at runtime with inline fallback.
- **Cross-Project Sync Phase 1 (data layer)**: Added 4 new SQLite tables, migration v7, 22 `LIBRARY_*` message types, library handler with sync engine, content hasher, and version manager.
- **Cross-Project Sync Phase 2 (Library UI)**: Built `LibraryView.tsx` with `AssetCard` grid, `SyncBadge`, `PromoteDialog`, `AssetDetailPanel`. Added "Library" sidebar entry. Full mock data in preview adapter.
- **Unit tests**: 45 tests across 3 files — library handler, content hasher, version manager.
- **CI/CD pipeline spec**: Updated to reflect all build steps including source map verification, axios version guard, lint steps, and release asset packaging.

### 2026-04-08 Session

- **Release CI hardening (v2.117.0)**: Fixed GitHub Actions failure when `pnpm-lock.yaml` is absent by falling back to `pnpm install --no-frozen-lockfile --lockfile=false` for root and `chrome-extension`. Added root + extension lint steps before tests. Release notes now explicitly include PowerShell/Bash install commands, manual unpacked-install steps, and `changelog.md` asset listing.

- **Rename Preset Persistence (v2.115.0)**: Added project-scoped IndexedDB KV store (`ProjectKvStore`) and `RenamePresetStore` for persistent rename configuration presets. Preset selector dropdown in bulk rename panel with Save/New/Delete. Auto-save on Apply, Close, and Cancel. Auto-load on panel open. Generic KV store is reusable by any plugin.
- **Spec Created**: `spec/21-app/02-features/macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md` — full spec for rename persistence with IndexedDB.
- **New Files**: `project-kv-store.ts` (generic KV), `rename-preset-store.ts` (preset CRUD).
- **Modified**: `bulk-rename.ts` (preset UI), `bulk-rename-fields.ts` (preset row builder), `workspace-rename.ts` (barrel exports).

### 2026-04-07 Session

- **Injection Pipeline Cache Gate**: Added IndexedDB-backed pipeline cache with HIT/MISS/FORCE states. On cache HIT, Stages 0–3 are skipped entirely. 3-layer invalidation: manifest version mismatch, automated rebuild, and manual `INVALIDATE_CACHE` message.
- **4-Tier CSP Fallback Chain**: Documented and aligned code with diagram — MAIN World Blob → USER_SCRIPT (Chrome 135+) → ISOLATED Blob → ISOLATED Eval. Updated spec and Mermaid diagram.
- **Force Run Support**: Added `forceReload` flag to context menu ("⚡ Force Run (bypass cache)") and shortcut handler (`force-run-scripts` command). Registered in `manifest.json` — users assign shortcut at `chrome://extensions/shortcuts`.
- **LLM Guide Updated**: `generate-llm-guide.ts` rewritten to reflect 7-stage + cache gate pipeline, 4-tier CSP fallback, `forceReload` parameter on `INJECT_SCRIPTS`, and pipeline cache documentation.
- **S-056 Completed**: Cross-Project Sync spec matured from DRAFT v1.0.0 → READY v2.0.0. Added conflict resolution rules, SQLite storage backend design with content hashing, and comprehensive edge case handling (14 acceptance criteria).
- **S-052 Completed**: Prompt click E2E verification checklist (7 tests) added to issue write-up #52. Covers fresh render, snapshot restore, MAIN world relay, save round-trip, error boundary, and action button isolation. Awaits manual Chrome execution.
- **ESLint**: Zero errors, zero warnings maintained throughout all changes.

### 2026-04-06 Hotfix

- Fixed click-injection ordering bug: if any script in the resolved chain has CSS, the injector now preserves full dependency order sequentially instead of executing non-CSS deps out of order.
- Added marco-sdk as an explicit macro-controller dependency so `window.marco` toast/auth APIs are guaranteed on manual inject.
- Fixed manual-run dependency recovery so `xpath` is forced ahead of `macro-looping` even when stored project metadata or popup ordering is stale.
- Improved session log read failures to print the exact missing OPFS path: `session-logs/session-<id>`.
- Fixed false-positive injection success by restoring macro-controller startup recovery hooks and re-registering the controller singleton in `api.mc`.
- Fixed cross-database `Sessions` lookups that caused repeated `no such table: Sessions` errors in error/user-script logging paths.
- Blocked built-in scripts from falling back to stale embedded storage code when bundled recovery fails.
- Unified extension/runtime script version to `2.98.0`. 

---

## Remaining Backlog

### Priority 0: Standalone Scripts — Global Instruction Types (2026-04-24)

Spec: `spec/21-app/01-chrome-extension/standalone-scripts-types/01-overview.md`
Draft types: `standalone-scripts/types/instruction/` (one type per file, awaiting Q1–Q5 sign-off).

| Task | Description | Status |
|------|-------------|--------|
| **0.1** — Review Q1–Q5 | Decide enum-vs-`as const`, optional-vs-required `xpaths`, `EmptySettings` naming, field renames, runtime base class. | Awaiting reviewer |
| **0.2** — Wire `compile-instruction.mjs` | Emit legacy keys (`world`, `isIife`, `inject`) for one release while runtime migrates. | Blocked on 0.1 |
| **0.3** — Migrate `payment-banner-hider/src/instruction.ts` | Import `ProjectInstruction<EmptySettings>`; delete local interface. | Blocked on 0.1 |
| **0.4** — Migrate `xpath/src/instruction.ts` | Same as 0.3; introduce `XPathRegistry` for the script's own selectors. | Blocked on 0.1 |
| **0.5** — Migrate `marco-sdk/src/instruction.ts` | Same as 0.3; shared `ProjectInstruction` re-export removed. | Blocked on 0.1 |
| **0.6** — Migrate `macro-controller/src/instruction.ts` | Add `MacroControllerSettings` type next to controller; pass to `ProjectInstruction<MacroControllerSettings>`. | Blocked on 0.1 |
| **0.7** — Logger `unknown` cleanup | Replace `unknown` in `riseup-namespace.d.ts` with `CaughtError` / `ReadonlyArray<JsonValue>`. | Independent |
| **0.8** — ESLint `id-denylist` rule | Ban `fn`, `cb`, `el`, `msg`, `cfg`, `ctx`, `obj`, `arr`, `str`, `num`, `tmp`, `val` repo-wide. | Independent |
| **0.9** — ESLint `consistent-type-definitions` | Scope `["error", "type"]` to `standalone-scripts/types/instruction/` first; widen later. | Independent |
| **0.10** — `.d.ts` `unknown` lint coverage | Extend the no-`unknown` ESLint rule to `.d.ts` files under `standalone-scripts/types/`. | Independent |
| **0.11** — `PaymentBannerHider` class refactor | External CSS file, no `!important`, no error swallowing, single-class entry; consume `XPathRegistry` from migrated instruction. | Blocked on 0.3 |
| **0.12** — Standalone-script scaffolder CLI | `pnpm new:standalone <name>` generates `instruction.ts`, vite/tsconfig, dist gitignore, CI build/e2e jobs, registry entries — using the new types. | Blocked on 0.1 |
| **0.13** — Banner-hider RCA follow-up | RCA at `spec/03-error-manage/01-error-resolution/03-retrospectives/2026-04-24-payment-banner-hider-rca.md`. 7 new memory standards (`pre-write-check`, `no-css-important`, `no-error-swallowing`, `no-type-casting`, `class-based-standalone-scripts`, `standalone-scripts-css-in-own-file`, `blank-line-before-return`) — registered in `mem://index`. | Memory updated; lint rules pending in 0.8 |
| **0.14** — Banner-hider runtime enums | Add `BannerLifecyclePhase` and `BannerEventName` to `standalone-scripts/types/runtime/enums/`. Replace every magic string in the rewritten `index.ts`. | Blocked on 0.11 |
| **0.15** — Typed DOM helpers in SDK | Add `RiseupAsiaMacroExt.Dom.queryHtmlElement(selector): HTMLElement \| undefined` and `queryAllHtmlElements(...)` so callsites never need `as HTMLElement`. | Blocked on 0.7 |
| **0.16** — `RiseupAsiaMessage<TPayload>` discriminated type | Replace every `as unknown as Message` cast with a typed dispatcher keyed on `kind: BannerEventName`-style enums. | Blocked on 0.15 |

### Priority 1: E2E Verification (Blocked — Manual)

| Task | Description | Status |
|------|-------------|--------|
| **Task 1.2** — E2E Chrome Verification | Load extension in Chrome, verify popup/options/CRUD/injection/context menu/import-export. S-052 checklist ready. | Blocked (requires manual Chrome testing) |

### Priority 2: Test Coverage

| Task | Description | Status |
|------|-------------|--------|
| **Task 2.2** — React Component Tests (S-021) | Unit tests for PopupApp, OptionsApp, ProjectsSection, ProjectEditor, DiagnosticsPanel. Target: 900+ tests | Ready |

### Priority 3: P Store — Project & Script Store

A marketplace for discovering, searching, and importing projects/scripts from a remote store API. Configurable store URL in Settings, search with caching, import flow. **Not ready — owner will fine-tune spec first.**

Spec folder: `spec/05-chrome-extension/82-pstore-project-store/`

### Priority 4: Cross-Project Sync — Phase 3 (In Progress)

Phase 1 (data layer) and Phase 2 (Library UI) complete. Remaining: ProjectGroup management UI, drag-to-assign projects, sync notifications, and E2E testing.

Spec: `spec/21-app/02-features/misc-features/cross-project-sync.md`

### Priority 5: Release Installer Hardening (v0.2)

The unified installer (`scripts/install.{ps1,sh}`) auto-derives the pinned version from its release-asset download URL and falls back to GitHub `latest` when no URL context is present (e.g., fetched from `raw.githubusercontent.com/.../main/` or run from a clone). v0.2 hardening, in priority order:

1. **Built-in checksum verification** — installer fetches `checksums.txt` from the same release and verifies the ZIP's SHA256 before extracting (~15 LOC per script).
2. **Authenticode-signed `install.ps1`** + GPG-signed `install.sh` released alongside `.sig` files.
3. **SLSA build provenance** for end-user audit of the GitHub Action that produced assets.

Memory: `.lovable/memory/features/release-installer.md`

---

## Completed Work (Summary)

| Area | Highlights |
|------|-----------|
| **AHK Layer** | E2E tests (22 suites, 150+ cases), XPath self-healing, config schema validation, hot-reload, token expiry UI |
| **Extension Releases** | v1.0–v2.119.0: injection, SQLite, auth, context menu, scaling, React unification, view transitions, cache gate, force run, cross-project sync |
| **Macro Controller** | v2.125.0: typed namespace API (`NsPathMap` + `nsWrite`/`nsReadTyped`/`nsCallTyped`), centralized `constants.ts` (96 constants in 2 phases, 21 consumer files migrated), error logging T1–T5 complete |
| **React UI Unification** | All 12 steps complete — content scripts moved, message client migrated, version bumped |
| **Immediate Workstream** | Swagger API Explorer, Storage Browser (4 categories), Prompt Seeding, Overflow Menus, Project Files Panel, ZIP Export/Import |
| **Injection Pipeline** | 7-stage + cache gate, 4-tier CSP fallback (MAIN Blob → USER_SCRIPT → ISOLATED Blob → ISOLATED Eval), Force Run (context menu + shortcut) |
| **Cross-Project Sync** | Phase 1: data layer (4 tables, migration v7, 22 message types, sync engine). Phase 2: Library UI (AssetCard, SyncBadge, PromoteDialog). 45 unit tests. |
| **UI Polish** | Tailwind hover micro-interactions (Task 4.1), direction-aware view transitions (Task 4.2) |
| **Build & Docs** | Build verification (Task 2.1), CDP injection docs (Task 3.1), AI onboarding checklist (Task 3.2), LLM guide updated |
| **Code Quality** | ESLint 1390 → 0 issues (0 errors, 0 warnings), SonarJS integration, TS migration v2 (6 phases), error logging T1–T5 complete (86 log migrations, 48 silent catches fixed, 548 `any` eliminated, 8 explicit API interfaces), typed namespace refactor (30+ paths), constants centralization Phase 1+2 (96 constants, 21 consumer files), `logError`/`logDebug`/`logConsole`/`logStackTrace` helpers, component splitting (SchemaTab, ConfigDbTab) |
| **Test Suite** | 1080 tests across 96 files — all passing. Injection handler, pipeline benchmark, message-flow integration, and panel-builder tests fixed. |
| **Specs Matured** | S-056 Cross-Project Sync (READY v2.0.0), S-052 Prompt Click verification checklist, error logging & type safety spec |
| **Issues Resolved** | #76–#90: cookie binding, hot-reload, globals migration, auth bridge, injection pipeline, IndexedDB cache, prompt click fix |

---

## Next Task Selection

| # | Task | Effort | Impact | Blocker |
|---|------|--------|--------|---------|
| 1 | **Task 2.2** — React component tests | Medium | High — catches UI regressions | None |
| 2 | **Task 1.2** — E2E Chrome verification | Low | High — validates real-world usage | Manual Chrome required |
| 3 | **Cross-Project Sync** — Shared asset library | High | High — new feature | Spec ready |
| 4 | **P Store** — Project marketplace | High | High — new feature | Owner spec pending |

**Recommended next**: Task 2.2 (React component tests) — no blockers, highest actionable impact.

---

## 🔥 Performance Audit — Idle / Background Loops (deep dive 2026-04-25)

> **Trigger**: User asked "are we running any loop in background that could harm performance — root-cause it and write it down so we don't forget."
> **Scope swept**: `src/`, `standalone-scripts/`, `chrome-extension/` for `setInterval`, `requestAnimationFrame`, `while(true)`, `for(;;)`, zero-delay `setTimeout`. 43 hits triaged.
> **Verdict**: 1 critical, 4 high, 3 medium leaks/wastes. Several "looks scary" hits are actually correctly bounded — listed under ✅ for completeness.

### 🔴 CRITICAL — fix first

| # | File | Issue | Why it harms perf | Root cause |
|---|---|---|---|---|
| **PERF-1** | `src/background/hot-reload.ts:34` + `vite.config.extension.ts:516` | **Hot-reload polls `build-meta.json` every 1 second forever — in PRODUCTION builds too.** Wakes the MV3 service worker every second, defeats Chrome's SW idle suspension, runs a `fetch()` + `JSON.parse()` per tick, fights the keepalive heuristics, and on shared/laptop machines visibly drains battery. | SW never sleeps → constant CPU/IO + extra "Marco extension was reloaded" logs. Also disables the very SW lifecycle the rest of the code (e.g. `keepalive`) tiptoes around. | `generateBuildMeta()` is wired unconditionally inside `defineConfig(({ mode }) => …)` — `isDev` is computed but never gates the plugin. So `dist/build-meta.json` ships in release ZIPs, and `startHotReload()` (called from `service-worker-main.ts:131`) sees the file present and starts the 1 s loop. The polling is also unkillable — no `clearInterval` and no stop API. |

**Fix sketch**: gate `generateBuildMeta()` behind `isDev` in `vite.config.extension.ts`, *and* in `hot-reload.ts` short-circuit if `chrome.runtime.getManifest().version_name?.includes('dev')` is false (defense in depth), *and* capture the interval ID + expose `stopHotReload()` for unit cleanliness.

### 🟠 HIGH — leaked / unbounded intervals

| # | File:line | Issue | Root cause |
|---|---|---|---|
| **PERF-2** | `standalone-scripts/macro-controller/src/ui/panel-controls.ts:393` | `setInterval(…, 5000)` to refresh the error-badge count is **fire-and-forget** — the returned ID is discarded. Every panel re-bootstrap (SPA nav, redock, theme swap) layers another 5 s timer on top, all writing to the same DOM badge. After N navigations on a long Lovable session this is N concurrent intervals. | Closure-style helper `function buildErrorBadge()` returns the button but never the timer handle; no `WeakRef`/teardown hook tied to panel lifecycle. |
| **PERF-3** | `standalone-scripts/macro-controller/src/ui/section-auth-diag.ts:179` | Same pattern — `setInterval(…, 10_000)` for the auth-diag refresh, ID discarded. Re-mounting the diagnostics section stacks duplicates. The visibility guard inside the callback prevents UI work but **does not stop the timer or the closure-held DOM refs** (memory leak when old panels are GC-orphaned). | Builder function `buildAuthDiagSection()` has no return-side teardown contract. |
| **PERF-4** | `standalone-scripts/macro-controller/src/ui/redock-observer.ts:24,39` | `RedockState.pollTimer` field + setter exist but **no code path ever assigns to it**. The actual polling is delegated to `pollUntil(...)` (lines 72-81) whose timer is internal and **cannot be cancelled** by `resetRedockState()`. So calling `resetRedockState()` during teardown leaves an orphan interval running until its `timeoutMs` (`pollMs * maxAttempts`) elapses — could be many minutes per re-bootstrap. | Refactor to `pollUntil` left the cancellation API stranded. Dead `pollTimer` accessor is the smell. |
| **PERF-5** | `src/content-scripts/network-reporter.ts:300,305` | `setInterval(flushBuffer, FLUSH_INTERVAL_MS)` runs **on every page** — content_scripts match `<all_urls>`. The interval has no clearInterval anywhere, no visibility-guard, no idle backoff. On a tab the user opened and forgot, this keeps ticking + serializing buffered network events forever. Multiplied by N background tabs = real CPU. | `initNetworkReporter()` is called at module top-level (line 305) with no lifecycle hook. Designed as "fire once at document_start" without considering long-lived tabs. |

### 🟡 MEDIUM — wasteful but bounded

| # | File:line | Issue | Root cause |
|---|---|---|---|
| **PERF-6** | `src/components/popup/InjectionCopyButton.tsx:206` | 15 s `chrome.runtime.sendMessage({ type: "GET_ACTIVE_ERRORS" })` poll while popup is open. Popup is short-lived so this is bounded, but it duplicates `use-error-count.ts` which already pushes via `ERROR_COUNT_CHANGED` broadcast. Net effect: SW gets 2 wake-ups per error change instead of 1. | Component was added before the broadcast existed and never refactored to subscribe. |
| **PERF-7** | `src/popup/hooks/usePopupData.ts:123` | 30 s poll fans out 4 `sendMessage` calls (`GET_STATUS`, `GET_HEALTH_STATUS`, `GET_ACTIVE_PROJECT`, `GET_ACTIVE_ERRORS`) **even when the popup tab is hidden** (popup can be detached into a window). No `document.hidden` guard like `DiagnosticsPanel.tsx` has (line 103). | Hook predates the visibility-pause pattern adopted in `DiagnosticsPanel`. |
| **PERF-8** | `standalone-scripts/macro-controller/src/toast.ts:211` (`queueDrainTimer`) | Drain timer self-stops only when queue empties **and** the SDK has loaded. If `getNotify()` keeps returning `null` (SDK never injects on a non-target tab), the interval ticks forever at `TOAST_QUEUE_POLL_MS` doing nothing useful. | `drainQueue()` early-returns when `notify === null` without arming a kill-switch or backoff. |

### ✅ Verified safe (no action — documenting so we don't re-flag them)

- `src/background/handlers/library-handler.ts:398` — `while (true)` is a slug-uniqueness search bounded by SQLite `SELECT`; one DB roundtrip per iteration, terminates on first miss.
- `standalone-scripts/marco-sdk/src/notify.ts:175` (`_dedupTimer`) — self-clears when `_recentToasts` map empties (line 178). ✅
- `standalone-scripts/macro-controller/src/loop-controls.ts:122,123,301` — all paired with explicit `clearInterval` in `stopLoop()` / `stopStatusRefresh()`.
- `standalone-scripts/macro-controller/src/startup-token-gate.ts:82` — bounded by `timeoutMs` with `finishTokenGate()` clearing the timer.
- `standalone-scripts/macro-controller/src/ui/countdown.ts:86` — paired with `stopCountdownTick()`; also self-stops when `state.running` becomes false.
- `standalone-scripts/{marco-sdk,macro-controller}/src/{utils,async-utils}.ts` `pollUntil` — timer cleared on success or `timeoutMs` expiry.
- `src/options/sections/DiagnosticsPanel.tsx:98` — gold-standard pattern: visibility-pause + cleanup on unmount.
- `src/hooks/use-network-data.ts`, `use-error-count.ts`, `use-token-watchdog.ts` — all paired with cleanup in `useEffect` return.

### Suggested execution order (when user greenlights)

1. **PERF-1** (production hot-reload) — highest user-visible impact, single-file fix.
2. **PERF-5** (network-reporter on every tab) — second biggest battery/CPU win.
3. **PERF-2 / PERF-3 / PERF-4** — macro-controller leak trio; introduce a shared "panel teardown registry" so builders can register `clearInterval` callbacks once and re-bootstrap is idempotent.
4. **PERF-6 / PERF-7 / PERF-8** — quality-of-life polish.

> 📌 **Do not touch yet** — user asked to record findings only. Per `mem://workflow/task-execution-pattern`, each PERF-* item gets its own RCA file in `spec/22-app-issues/` before code changes.

---

## Engineering Principles (Summary)

1. Root Cause Analysis First
2. Known-Good State Wins
3. UI Sync Completeness
4. Side Effect Awareness
5. API-First, DOM-Fallback
6. No Direct resp.json()
7. SQLite Schema Consistency
8. Issue Write-Up Mandatory
9. NEVER change code without discussing with user first

Full list: `/spec/02-coding-guidelines/engineering-standards.md` (26 standards)
