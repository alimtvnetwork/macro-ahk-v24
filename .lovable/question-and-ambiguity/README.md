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
