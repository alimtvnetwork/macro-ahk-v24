# Phases — Macro Recorder

**Version:** 1.0.0
**Updated:** 2026-04-26
**Total Phases:** 12

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete |
| 🟡 | Partial — seed work exists, formal phase not yet executed |
| ⬜ | Not started |

---

## Phase Table

| # | Phase | Status | Output |
|---|-------|--------|--------|
| 01 | Discovery + Spec Scaffold | ✅ | `00-overview.md`, `01-glossary.md`, `02-phases.md`, `99-consistency-report.md` (this folder) + `32-app-performance/` skeleton |
| 02 | Codebase + Testing Audit | ✅ | `32-app-performance/01-performance-findings.md` (15 inherited + 7 new findings) + `02-testing-findings.md` (5 unit gaps + 7 E2E gaps + 4 infra gaps) |
| 03 | Data Model Design | ✅ | `03-data-model.md` (9 PascalCase tables, Int-AutoIncrement PKs, normalised lookup tables w/ Enums) + `03-erd.md` (Mermaid ERD w/ self-FK on Selector) |
| 04 | Backend Provisioning | ✅ | Per-project SQLite split-DB pattern: `04-per-project-db-provisioning.md` + `src/background/recorder-db-schema.ts` (9 tables, idempotent, lookup-seeded) wired into `initProjectDb` + auto-provisioned by `handleSaveProject`; 9 unit tests in `recorder-db-schema.test.ts` |
| 05 | Toolbar + Recording Control UI | ✅ | `src/background/recorder/recorder-store.ts` (pure reducer: Idle↔Recording↔Paused, Capture/Rename/Delete with anchor rewrite + variable uniqueness) + `recorder-session-storage.ts` (chrome.storage.local mirror) + `toggle-recording` shortcut wired in `shortcut-command-handler.ts` + manifest command (`Ctrl/Cmd+Shift+R`); 25 unit tests passing. Toolbar render layer (Shadow Root UI) deferred to UI integration in Phase 09. |
| 06 | XPath Capture Engine | ✅ | `xpath-anchor-strategies.ts` (auto-anchor walk + relative XPath builder) + `xpath-label-suggester.ts` (label/aria/placeholder → PascalCase identifier, leading-digit safe) + `xpath-recorder.ts` rewired to emit `XPATH_CAPTURED` with `XPathFull` / `XPathRelative` / `AnchorXPath` / `Strategy` / `SuggestedVariableName`; 16 unit tests passing in `xpath-capture-engine.test.ts`; spec at `06-xpath-capture-engine.md` |
| 07 | Data Source Drop Zone | ✅ | `recorder/data-source-parsers.ts` (CSV RFC-4180 subset + JSON-array parsers, pure) + `recorder/data-source-persistence.ts` (insert/list via `initProjectDb`) + `handlers/recorder-data-source-handler.ts` + new `RECORDER_DATA_SOURCE_ADD/LIST` MessageType wired in `message-registry.ts`. 9 parser unit tests passing. Drop-zone overlay UI deferred to Phase 09 with Shadow-Root toolbar. Spec at `07-data-source-drop-zone.md` |
| 08 | Field Reference Wrapper | ✅ | `recorder/field-reference-resolver.ts` (pure `{{Column}}` token resolver w/ escape + extractor) + `recorder/field-binding-persistence.ts` (upsert/list/delete + column-exists validator against `DataSource.Columns`) + `handlers/recorder-field-binding-handler.ts` + 3 new `RECORDER_FIELD_BINDING_*` MessageType entries wired in `message-registry.ts`. 10 resolver unit tests passing. Hover-overlay UI deferred to Phase 09 with Shadow-Root toolbar. Spec at `08-field-reference-wrapper.md` |
| 09 | Step Persistence + Replay Contract | ✅ | `recorder/step-persistence.ts` (insert/list/delete Step + Selector w/ pure DB-layer + async `initProjectDb` facade) + `recorder/replay-resolver.ts` (deterministic XPath/Css/Aria resolution + cycle guard, depth cap 16) + `handlers/recorder-step-handler.ts` + 4 new `RECORDER_STEP_*` MessageType entries wired in `message-registry.ts`. 15 unit tests passing in `step-persistence-and-replay.test.ts`. Shadow-Root toolbar UI deferred per `mem://preferences/deferred-workstreams.md`. Spec at `09-step-persistence-and-replay.md` |
| 10 | Project Visualisation | ✅ | `hooks/use-recorder-project-data.ts` + `components/options/recorder/{RecorderStepGraph,RecorderStepDetail,RecorderVisualisationPanel}.tsx` lazy-mounted into a new `"recorder"` overflow tab in `ProjectDetailView`. Backend: 2 new messages (`RECORDER_STEP_RENAME`, `RECORDER_STEP_SELECTORS_LIST`) + `updateStepVariableName(Row)` w/ uniqueness + empty-name guards. 3 new unit tests (18/18 total in `step-persistence-and-replay.test.ts`). Spec at `10-project-visualisation.md` |
| 11 | Inline JavaScript Step | ✅ | `recorder/js-step-sandbox.ts` (frozen `Ctx`, `"use strict"`, 11-token denylist, 4000-char cap, async-aware) + `recorder/js-snippet-persistence.ts` (CRUD via UNIQUE `Name` upsert) + `JsSnippet` table added to `recorder-db-schema.ts` + `handlers/recorder-js-handler.ts` + 4 new `RECORDER_JS_*` MessageType entries wired in `message-registry.ts`. 21 unit tests passing in `js-step-sandbox.test.ts` (83/83 across recorder suite). Editor UI deferred per `mem://preferences/deferred-workstreams.md`. Spec at `11-inline-javascript-step.md` |
| 12 | LLM Guide + Hardening | ✅ | `LlmGuide.md` (10-section AI-facing canonical guide w/ file map, conventions, message catalogue, common pitfalls) + `12-record-replay-e2e-contract.md` (full record→bind→persist→visualise→replay coverage matrix backed by 83 unit tests) + `spec/32-app-performance/03-final-perf-pass.md` (PERF-R1..R7 audit: 2 Resolved, 3 Mitigated, 3 Deferred per `mem://preferences/deferred-workstreams.md`). All 12 phases ✅. |
| 13 | Capture-to-Step Bridge | ✅ | `recorder/capture-to-step-bridge.ts` (pure XPATH_CAPTURED → StepDraft + `findAnchorSelectorId` lookup) + `handlers/recorder-capture-handler.ts` + new `RECORDER_CAPTURE_PERSIST` MessageType wired in `message-registry.ts`. 13 unit tests (102/102 across recorder suite). Spec at `13-capture-to-step-bridge.md`. Content-script producer rename deferred with Shadow-Root toolbar. |

---

## Execution Protocol

1. User sends `next` → AI executes the next ⬜ or 🟡 phase.
2. Each phase ends with this table updated and a remaining-tasks summary.
3. Acceptance criteria for each phase live in the original instruction message; final consolidated `97-acceptance-criteria.md` is produced in Phase 12.

---

## Recovery Hint

The current phase index is mirrored in
`mem://project/macro-recorder-phase-progress.md`. If chat context is lost,
read that file to resume from the right phase.
