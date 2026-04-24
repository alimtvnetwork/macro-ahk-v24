# Roadmap — Marco / Macro Controller

> Single source of truth for the project roadmap. Suggestions live in `.lovable/suggestions.md`. Pending issues in `.lovable/pending-issues/`.

---

## 🔄 In Progress

_Nothing currently in progress — TS Migration V2 backlog fully cleared at v2.225.0 (2026-04-23)._

---

## ⏳ Pending — Next Up

| # | Item | Priority | Reference |
|---|---|---|---|
| 1 | Surface latest sdkSelfTest + kv/files/gkv round-trip results in popup (✅/❌ + last-run timestamp) | Medium | `.lovable/suggestions.md` |
| 2 | Release installer hardening v0.2 — checksum verification + signing | Medium | `mem://workflow/13-next-commands` |
| 3 | **AC-2 main-branch fallback in installer** — implement spec §2 step 5 (currently exits 5 instead of falling through with `🌿` banner) | Medium | `.lovable/memory/suggestions/20260424-1900-suggestion-installer-ac2-main-branch-fallback.md` |
| 4 | Pre-existing resolver-suite failure: `SIBLING_NAME_PATTERN` from `install.config.sh` not sourced when test cwd ≠ repo root (1/46 fail) | Low | `tests/installer/resolver.test.sh:357` |


---

## ⏳ Pending — Carried Over (Deferred per user, do NOT auto-recommend)

| # | Item | Reference | Reason |
|---|---|---|---|
| D1 | React Component Tests (target 900+) | S-021 | Deferred by user 2026-04-23 |
| D2 | Prompt Click E2E Verification (Issues 52/53) | `.lovable/pending-issues/05-future-pending-work.md` | Manual Chrome testing avoided |
| D3 | P Store Marketplace | `spec/05-chrome-extension/82-pstore-project-store/` | Discuss-later mode |
| D4 | Cross-Project Sync & Shared Library | `spec/08-features/cross-project-sync.md` | Depends on D3 |

---

## ✅ Completed

### Session 2026-04-24 — Installer audit + handler-guards regression + sql.js types

| Task | Result |
|---|---|
| Audit `scripts/install.{ps1,sh}` against generic installer spec §2/§3/§5/§6 | ✅ — resolver order, exit codes, CLI surface all conform; AC-2 main-branch fallback gap logged for sign-off |
| Add explicit AC-1 (no-flag + releases-exist → install latest) coverage to `tests/installer/mock-server.test.sh` | ✅ — 7 new assertions; mock-server suite **39/39** passing |
| Vitest regression suite for handler-guards (missing-field payloads → clean `{ isOk:false }`, DB never touched) | ✅ — `src/test/regression/handler-guards.test.ts` adds **27 tests** across kv / grouped-kv / file-storage / project-api; full suite **478/478** passing |
| Eliminate sql.js typecheck noise (17 pre-existing errors) | ✅ — installed `@types/sql.js@1.4.9`, deleted local `src/types/sql.js.d.ts` stub, redirected 5 `SqlValue` imports to `handler-types`, switched `SqlJs` aliases to `SqlJsStatic`, narrowed `BindParams` Array.isArray guards in `sqlite-bind-safety.ts`. `tsc --noEmit` clean; 478/478 tests green. |

### Session 2026-04-23 — v2.225.0 (TS Migration V2 cleared)

| Task | Result |
|---|---|
| TS Migration V2 Phase 02 — Class Architecture (S-046) | ✅ verified — `standalone-scripts/macro-controller/src/core/` (MacroController + 5 managers) |
| TS Migration V2 Phase 04 — Performance & Logging (S-047) | ✅ verified — `dom-cache.ts`, `log-manager.ts`, `CreditAsyncState`, `LogFlushState` |
| TS Migration V2 Phase 05 — JSON Config Pipeline (S-048) | ✅ implemented — activity-log routing in `shared-state.ts`; 7 vitest cases; build 12.35s |
| Stabilize 8 failing time-sensitive snapshot tests | ✅ frozen `Date.now()` via `vi.setSystemTime` — full suite **445/445** passing |
| TS Migration V2 Phase 03 — React Feasibility (S-051) | ✅ re-evaluated — **NOT PROCEEDING** (UI 15,223 lines < 20K threshold) |
| Move resolved E2E React UI verification from pending → solved | ✅ `.lovable/solved-issues/11-e2e-verification-react-ui.md` |

### Session 2026-04-20 — v2.162.0 → v2.167.0

| Task | Result |
|---|---|
| SDK runtime self-test for `Projects.RiseupMacroSdk` (sync — namespace, meta, shape, kv.list Promise) | ✅ v2.161.0 / hardened later |
| Spec 11/63 + developer-guide updated for `RiseupMacroSdk` self-namespace | ✅ |
| Build-time check: scan `spec/**.md` for relative links, fail on missing targets | ✅ |
| Fix `MESSAGE-ROUTER_ERROR` "tried to bind a value of an unknown type (undefined)" | ✅ v2.162.0 (kv-handler) → v2.163.0 (logging handlers) |
| Audit all SQLite-backed handlers — adopt `handler-guards.ts` (`requireProjectId`/`requireKey`/`bindOpt`/`bindReq`) across kv, gkv, file-storage, project-api, logging, user-script-log, error | ✅ v2.164.0 |
| Global Proxy net `wrapDatabaseWithBindSafety` + typed `BindError` (param idx + column name + SQL preview) wired at `db-manager` and `project-db-manager` | ✅ v2.165.0 |
| Extend SDK self-test with KV round-trip (set → get → verify-equals → delete → verify-cleared) | ✅ v2.166.0 |
| Audit prompt/library/settings/project/project-config/script-config/updater/run-stats — adopt handler-guards (4 of 8 had no SQLite surface; 3 hardened: prompt-handler, library-handler, updater-handler; project-config already guarded) | ✅ v2.167.0 |
| Hook `BindError` into Errors panel reporter — message-router special-cases `BindError` and routes through `logBgError(SQLITE_BIND_ERROR)` with column + SQL preview as `context` | ✅ v2.168.0 |
| Extend SDK self-test round-trip to FILES (save→list-includes→read→delete→list-excludes) and GKV (set→get→delete→get-cleared) — three independent PASS/FAIL lines so a backend break on one surface never masks the others | ✅ v2.169.0 |

### Earlier Milestones (preserved)

#### Error Logging & Type Safety — ✅

**Spec**: `spec/21-app/02-features/macro-controller/ts-migration-v2/08-error-logging-and-type-safety.md`

| Task | Description | Status |
|------|-------------|--------|
| T1 | Create `NamespaceLogger` class in SDK | ✅ |
| T2 | Update `globals.d.ts` with full namespace + Logger types | ✅ |
| T3 | Fix all 16 swallowed errors (S1–S16) | ✅ |
| T4 | Eliminate all `any` types (5 files) | ✅ |
| T5 | Migrate controller `log(msg, 'error')` calls to `Logger.error()` | ✅ |
| T6 | Verify: `tsc --noEmit` passes, ESLint zero errors | ✅ |

#### Constants Enum Reorganization — ✅

Grouped 85+ constants into 8 string enums in `types/`: `DomId`, `DataAttr`, `StyleId`, `StorageKey`, `ApiPath`, `PromptCacheKey`, `Label`, `CssFragment`. 317 enum references across 56 files.

#### Rename Preset Persistence — ✅

**Spec**: `spec/21-app/02-features/macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md`

| Task | Description | Status |
|------|-------------|--------|
| 1 | Generic `ProjectKvStore` module (IndexedDB) | ✅ `project-kv-store.ts` |
| 2 | `RenamePresetStore` module | ✅ `rename-preset-store.ts` |
| 3 | `buildPresetRow()` UI helper | ✅ `bulk-rename-fields.ts` |
| 4 | Persistence integration in `bulk-rename.ts` | ✅ |
| 5 | Barrel exports updated | ✅ `workspace-rename.ts` |
| 6 | Version bump | ✅ Subsumed by ongoing version policy |
