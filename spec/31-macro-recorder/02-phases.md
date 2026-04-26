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
| 04 | Backend Provisioning | ⬜ | Lovable Cloud migrations for all tables + RLS owner-scoped policies |
| 05 | Toolbar + Recording Control UI | 🟡 | Seed: `26-chrome-extension-generic/06-ui-and-design-system/10-toolbar-recording-ux.md`. Phase output: `RecorderStore` + toolbar wiring + shortcut |
| 06 | XPath Capture Engine | 🟡 | Seed: `tests/e2e/e2e-21-xpath-capture.spec.ts` (full + relative + anchor + determinism). Phase output: anchor selection UI + PascalCase suggester wired to live capture |
| 07 | Data Source Drop Zone | ⬜ | CSV/JSON drop, column parse, persisted `DataSource` linked to active Project |
| 08 | Field Reference Wrapper | ⬜ | "Add Field Reference" hover overlay + column picker + persisted `FieldBinding` |
| 09 | Step Persistence + Replay Contract | ⬜ | Per-interaction `Step` writes + replay resolution doc |
| 10 | Project Visualisation | ⬜ | Ordered Step graph + detail panel + variable rename |
| 11 | Inline JavaScript Step | ⬜ | `JsStep` sandbox + reusable `JsSnippet` library |
| 12 | LLM Guide + Hardening | 🟡 | Seed: `tests/e2e/e2e-21-xpath-capture.spec.ts`. Phase output: `LlmGuide.md` + full record→bind→persist→visualise→replay E2E + final perf pass |

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
