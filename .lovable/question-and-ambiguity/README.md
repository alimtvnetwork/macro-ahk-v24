# Ambiguity & Open Questions Index

**Mode:** No-Questions Mode (40-task window) — activated 2026-04-26.

While this mode is active, the AI does **not** interrupt to ask clarifying
questions. Instead, every uncertain decision is logged here as a numbered
file so the user can review and override later.

## How entries work

- File naming: `xx-brief-title.md` (sequential, zero-padded).
- Each entry captures: original task text, the point of confusion, all
  considered options with pros/cons, and the inference the AI proceeded with.
- The user can resume question-asking at any time by saying
  **"ask question if any understanding issues"**.

## Entries

<!-- Append one bullet per file, newest at the bottom. -->

- [01 — Import/Export "screen": dedicated route vs promoted section](./01-import-export-screen-shape.md) — chose Option B (promoted card in existing page).
- [02 — Hover highlighter shape](./02-hover-highlighter-shape.md) — chose Option 2 (accent left-bar + ring on the exact innermost row).
- [03 — Per-group JSON input data: scope, persistence, semantics](./03-group-input-data-flow.md) — chose per-group scope, sibling localStorage bag, paste/upload + load-current dialog.
- [04 — CSV input flow: row strategy & coercion rules](./04-csv-input-flow.md) — chose single-row apply with sanitised variable names + per-column type coercion.
- [05 — Result webhook endpoint shape](./05-result-webhook-shape.md) — chose POST JSON, four event toggles, free-form headers, fire-and-forget with 8 s timeout.
- [06 — Run-time input source (HTTP fetch at run start)](./06-run-time-input-source.md) — chose project-wide GET/POST endpoint fetched once per batch, merged on top of local bag, configurable abort-vs-continue on failure.
- [07 — Post-step wait-for-selector condition](./07-wait-for-selector.md) — per-step, three conditions (Appears/Disappears/Visible), auto-detect XPath vs CSS, default 5 s timeout.
- [08 — Webhook retry queue (DECLINED — kept fail-fast per spec #05)](./08-webhook-retry-queue.md) — chose Option A (decline).
- [09 — Bulk labels vs categories conflict with prior flat-tags decision](./09-bulk-labels-vs-categories.md) — chose Option B (tags unchanged + add single optional `Category` field, mirroring `Prompts.Category`).
- [10 — Step list bulk context-menu shape (Enabled + Label fields)](./10-step-bulk-context-menu-shape.md) — chose A1 + B1: add optional `Enabled?` and `Label?` to `KeywordEventStep` (additive, default-safe).
- [11 — Keyword-events ZIP import matching policy](./11-keyword-events-import-matching.md) — match by Uid first, fallback to Keyword (case-insensitive); skip unmatched imports; preserve Id/SortOrder; gated by dry-run summary.
- [12 — Per-user storage for Batch Rename Sequence settings](./12-per-user-bulk-rename-prefs.md) — **declined / pending**: no auth layer, No-Supabase rule, Chrome profiles already isolate per OS-user; recommend Option A (skip).
- [13 — Tests for tooltip example reacting to Padding](./13-tooltip-padding-tests.md) — **declined / pending**: violates Deferred-Workstreams (skip React component tests); tooltip is currently static text, only the inline SequenceFormulaExample is dynamic; recommend Option A (skip), or Option C if user wants the tooltip dynamic + a pure-function unit test.
- [14 — TS7006 errors in WebhookSettingsDialog (none found)](./14-webhook-settings-ts7006.md) — **no-op / pending**: full `tsc` pass reports 0 errors project-wide; likely stale IDE TS server; recommend Option A (no change) until exact diagnostic provided.
- [15 — Unit tests for `dispatchWebhook`](./15-dispatch-webhook-tests.md) — **pending user choice**: pure-function tests are not literally banned by Deferred-Workstreams (which targets React component tests); would lock in `webhook-fail-fast` Core invariant; recommend Option A (write Vitest unit tests for fail-fast + token expansion + delivery-log shape).
- [16 — E2E test for sqlite-bundle export/import (replace + merge)](./16-sqlite-bundle-roundtrip-e2e-test.md) — **pending user choice**: replace round-trip already covered in `sqlite-bundle-roundtrip.test.ts`; only the merge path is uncovered; recommend Option A (add one `it()` for merge to the existing file).
- [17 — Error-swallowing audit UI: data source & route](./17-error-swallow-audit-ui.md) — **proceeded with Option B**: built UI page consuming `public/error-swallow-audit.json` with documented contract + graceful empty state; scanner script tracked as plan.md follow-up (separate workstream).
- [18 — Pre-commit scanner: husky vs npm `check:` script](./18-precommit-swallow-scanner.md) — **proceeded with Option B**: shipped `scripts/check-no-swallowed-errors.mjs` matching the existing `check:*` convention, with `--strict` / `--update-baseline` modes mirroring `check:no-bg-dynamic-import`; baseline captures 177 pre-existing sites so CI can adopt immediately without breaking; husky hook can be added later without touching the scanner.
- [19 — "Copy log to clipboard" button on webhook delivery entries](./19-copy-webhook-log-button.md) — **proceeded with Option B**: shipped reusable `<CopyLogButton entry={...} />` + pure `formatWebhookDeliveryLog` helper under `src/components/webhook/` with formatter unit test; drops into the future delivery list when it ships.
- [20 — Webhook payload preview panel (already exists)](./20-webhook-payload-preview-already-exists.md) — **no-op**: expandable payload panel already implemented at WebhookSettingsDialog.tsx:668–708 with chevron toggle, `payloadOpenIdx` state, `<pre>` JSON block, aria controls, disabled-when-no-payload, and sibling "Copy details" button.
- [21 — "Copy details" in expanded webhook row (already exists)](./21-copy-details-already-exists.md) — **no-op**: button already at WebhookSettingsDialog.tsx:856–863, copies variant-specific Success/Skipped/Failure block via `buildLogClipboardText` (upgraded last turn).
- [22 — Logger.error conversion scope (5-file batch)](./22-logger-error-conversion-scope.md) — **proceeded with variant**: converted real `console.error` calls in prompt-injector (3), injection-handler (3), use-popup-actions (3) using namespace-logger shims; **skipped** monaco-js-intellisense (only Monaco snippet string literals — converting would break user-facing snippets) and **skipped** schema-migration (existing `// Keep bare` comment — DB is mid-migration, namespace logger would recurse on broken schema).
- [23 — Wave 4 P1 breadcrumbs: tight-loop emitter scope](./23-wave4-breadcrumbs-tight-loop-emitter.md) — **proceeded with variant**: shipped `logSampledDebug(tag, key, message, error?)` in `bg-logger.ts` (3-emit/SW-lifetime budget); instrumented 11 SW-side P1 sites across csp-fallback, boot, prompt-handler, storage-browser-handler, config-auth-handler; intentionally left in-page serialized catches silent (cannot import bg-logger; observability preserved via SW-side `combinedError` logging in `runCspFallback`).
- [24 — Wave 3 scope: only 2 sites in target files, not 5](./24-wave-3-scope-only-2-sites-not-5.md) — **proceeded with Option A**: audit JSON only lists 2 catches in the named files (`auth-health-handler.ts:167` P0 + `context-menu-handler.ts:287` P1); fixed both with `logBgWarnError`/`logCaughtError`; total P0 8 → 7. Other 6 P0 live in injection-handler/wrapper, logging-handler, script-resolver, service-worker-main — awaiting explicit "include the rest" or "next".
- [25 — Wave 5 scope: no list provided](./25-wave-5-scope-no-list-provided.md) — **proceeded with Option C**: converted 7 real stragglers (NotFound, recorder-session-sync, message-relay HomeScreen boot, OnboardingFlow boundary, StorageBrowserView.loadData, ThemeProvider CSS sentinel, result-webhook validator) using `logCaughtError`/namespace shims; created `src/components/options/options-logger.ts` + `src/lib/lib-logger.ts` shims to mirror existing popup/home-screen pattern; added `BgLogTag.WEBHOOK`. **Skipped 16** intentional-bare sites (logger internals, OPFS bootstrap, schema-migration mid-DB, page-world `func:` injections, monaco snippet templates, standalone bundles, generated files) — full table in the note.
- [26-build-lock-vs-retry](./26-build-lock-vs-retry.md) — Chose build-lock sentinel over retry/backoff to honor no-retry policy
- [27-db-diagrams-folder-location](./02-db-diagrams-folder-location.md) — Reused existing `spec/23-database/{diagrams,images}/` rather than creating `src/db/diagrams`; runtime `src/` is wrong place for spec docs, and the 23-database folder was already populated earlier this session.
