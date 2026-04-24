# Roadmap — Marco / Macro Controller

> Single source of truth for the project roadmap. Suggestions live in `.lovable/suggestions.md`. Pending issues in `.lovable/pending-issues/`.

---

## 🔄 In Progress

_Nothing currently in progress._

---

## ⏳ Pending — Next Up

| # | Item | Priority | Reference |
|---|---|---|---|
| 1 | Per-script migration to shared `ProjectInstruction` types (Priority 0.2–0.6) | Low | checklist ready |
| 2 | Installer hardening v0.3 — sign `checksums.txt` (minisign or cosign) | Low | spec §7.1.4 rule 5 |
| 3 | Mirror AC-2 main-branch fallback in `install.ps1` | Medium | spec §2 step 5 |
| 4 | Wire `check:installer-contract` into `.github/workflows/installer-tests.yml` | Medium | spec §13 |


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

### Session 2026-04-24 — AC-2 main-branch fallback + Installer hardening v0.2 (SHA-256) + SDK self-test popup panel + installer audit + handler-guards regression + sql.js types

| Task | Result |
|---|---|
| **AC-2 — main-branch fallback in `install.sh`** (spec §2 step 5) | ✅ — `fetch_latest_version()` now distinguishes HTTP 200+empty / 404 (→ `__MAIN_BRANCH__` sentinel + `🌿 Discovery mode — main branch (no releases found)` banner, exit 0) from 5xx/network (→ exit 5 unchanged). New `download_main_branch_tarball()` fetches `archive/refs/heads/<MAIN_BRANCH>.tar.gz`; `install_extension()` handles tar.gz with `--strip-components=1`. VERSION file records `<branch>@HEAD`. Mock server: `MOCK_ZERO_RELEASES=1\|404` + new tarball route + ustar `buildFakeTarGz()`. **AC-2 added (12 new assertions, 2 sub-cases)**; mock-server suite **62/62** passing, resolver **46/46** (mock curl rewritten to honor `-o`/`-w '%{http_code}'`), Vitest **484/484**. Spec §2.2 rule 2 + AC-2 row updated. |
| **Installer hardening v0.2 — SHA-256 checksum verification** | ✅ — `install.sh` `verify_checksum()` + `install.ps1` `Test-Checksum` fetch `checksums.txt` from same release, compare SHA-256 (sha256sum/shasum/openssl/Get-FileHash), exit 6 on mismatch, soft-warn on missing/no-tool. Mock server emits `checksums.txt` with `MOCK_CHECKSUM_MODE=correct\|wrong\|missing`. **3 new ACs (AC-21/22/23) + 12 assertions**; mock-server suite **51/51** passing. Spec §7.1 added (Checksum verification contract) + AC-21/22/23 in §9. |


| Task | Result |
|---|---|
| **Surface SDK self-test results in popup** (✅/❌ + last-run per surface) | ✅ — new `SDK_SELFTEST_REPORT` + `GET_SDK_SELFTEST` messages, `sdk-selftest-handler.ts` persists 4 surfaces (sync/kv/files/gkv) to `chrome.storage.local["marco_sdk_selftest"]`. SDK `self-test.ts` mirrors each PASS/FAIL via fire-and-forget `sendMessage`. New `SdkSelfTestPanel.tsx` lazy-loaded into `Popup.tsx` with relative timestamps + manual refresh. **6 new vitest cases**; full suite **484/484** passing. |
| Audit `scripts/install.{ps1,sh}` against generic installer spec §2/§3/§5/§6 | ✅ — resolver order, exit codes, CLI surface all conform; AC-2 main-branch fallback gap logged for sign-off |
| Add explicit AC-1 (no-flag + releases-exist → install latest) coverage to `tests/installer/mock-server.test.sh` | ✅ — 7 new assertions; mock-server suite **39/39** passing |
| Vitest regression suite for handler-guards (missing-field payloads → clean `{ isOk:false }`, DB never touched) | ✅ — `src/test/regression/handler-guards.test.ts` adds **27 tests** across kv / grouped-kv / file-storage / project-api |
| Eliminate sql.js typecheck noise (17 pre-existing errors) | ✅ — installed `@types/sql.js@1.4.9`, deleted local stub, redirected `SqlValue` imports to `handler-types`, switched aliases to `SqlJsStatic`, narrowed `BindParams` Array.isArray guards. `tsc --noEmit` clean. |
| Fix resolver-suite `SIBLING_NAME_PATTERN` failure | ✅ — root cause was Bash `${VAR:=macro-ahk-v{N}}` parsing the FIRST `}` as the parameter-expansion closer, silently truncating to `macro-ahk-v{N`. Refactored both `scripts/install.sh` and `scripts/install.config.sh` to assign the literal via a temp variable. Resolver suite now **46/46** passing. |


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
