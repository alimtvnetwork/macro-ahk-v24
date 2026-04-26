# Phase 09 — Step Persistence + Replay Contract

**Phase:** 09 of 12
**Status:** ✅ Complete
**Updated:** 2026-04-26

---

## 1. Goal

Persist every recorded interaction as a `Step` row plus 1..N `Selector`
rows in the per-project SQLite database, and define the deterministic
contract that a replay engine uses to translate those rows back into the
single XPath/CSS/Aria expression to evaluate.

UI-side overlay rendering for live recording is **not** in scope for this
phase — see `mem://preferences/deferred-workstreams.md`. Phase 10 wires
the persisted Steps into the visualisation panel.

---

## 2. Modules

| Module | Purpose |
|--------|---------|
| `src/background/recorder/step-persistence.ts` | Insert / list / delete Steps + Selectors via per-project DB. Pure DB-layer functions accept a `SqlJsDatabase` so they're testable in-memory; async wrappers route through `initProjectDb(slug)`. |
| `src/background/recorder/replay-resolver.ts` | Pure function `resolveStepSelector(selectors)` returning the final expression string + cycle-protected anchor chain. |
| `src/background/handlers/recorder-step-handler.ts` | Background message handlers for `RECORDER_STEP_INSERT`, `_LIST`, `_DELETE`, `_RESOLVE`. |

---

## 3. Persistence Rules

1. **Step ordering** — `OrderIndex` is `MAX(OrderIndex) + 1` at insert time.
   Gaps after deletes are intentional and preserved.
2. **Variable names** — enforced unique by `IxStepVariableNameUnique`
   (DB-level UNIQUE INDEX). Caller (recorder store) is responsible for
   generating unique names; DB throws on collision.
3. **Selectors per Step**
    - Must have ≥ 1 selector.
    - Exactly one MUST have `IsPrimary = 1` (validated in TS *and* by the
      partial unique index `IxSelectorPrimaryPerStep`).
    - `AnchorSelectorId` is only valid on `XPathRelative` (kind 2) — both
      a TS guard *and* the schema CHECK enforce this.
4. **Cascade** — deleting a Step drops every child `Selector` and any
   `FieldBinding` row (FK ON DELETE CASCADE).

---

## 4. Replay Contract

`resolveStepSelector(selectors)` returns:

```ts
interface ResolvedSelector {
    Kind: "XPath" | "Css" | "Aria";
    Expression: string;
    AnchorChain: ReadonlyArray<number>;  // SelectorIds traversed
}
```

Resolution algorithm:

1. Pick the row with `IsPrimary = 1`.
2. If `XPathFull` (kind 1): return `Expression` as-is.
3. If `XPathRelative` (kind 2):
   a. Recursively resolve `AnchorSelectorId`.
   b. Concatenate `${anchor}${rest}` where `rest` strips a leading `.` and
      ensures a `/` separator.
4. If `Css` / `Aria`: return raw `Expression`; replay engine routes on `Kind`.
5. Anchor depth is capped at **16** to halt cycles. A cycle (visiting the
   same `SelectorId` twice) throws.

The handler `RECORDER_STEP_RESOLVE` reads only the selectors of the
target Step, so callers do not need to fetch the full project. Cross-step
anchor references are supported because `AnchorSelectorId` is a
project-global FK; the handler will refuse if the anchor is outside the
fetched set, prompting the caller to widen the read.

---

## 5. Message Surface (added to `MessageType` enum)

| Type | Request | Response |
|------|---------|----------|
| `RECORDER_STEP_INSERT` | `{ projectSlug, draft }` | `{ isOk: true, step, selectors }` |
| `RECORDER_STEP_LIST` | `{ projectSlug }` | `{ steps }` |
| `RECORDER_STEP_DELETE` | `{ projectSlug, stepId }` | `{ isOk: true }` |
| `RECORDER_STEP_RESOLVE` | `{ projectSlug, stepId }` | `{ resolved }` |

All 4 are wired in `src/background/message-registry.ts`.

---

## 6. Tests

`src/background/recorder/__tests__/step-persistence-and-replay.test.ts` —
**15 tests, all passing**, covering:

- Step insert + Selector child write
- Monotonic `OrderIndex`
- Empty / zero-primary / multi-primary rejection
- `VariableName` uniqueness
- Anchor-on-non-relative rejection
- Cascade delete (Step → Selector + FieldBinding)
- `listStepRows` ordering
- Full XPath verbatim resolution
- Relative + anchor concatenation with leading-dot stripping
- Missing-anchor error
- Cycle detection
- CSS expression pass-through
- Missing-primary error

---

## 7. Out of Scope (deferred)

- Shadow-Root toolbar UI for live capture (Phase 09 originally bundled
  this; deferred per `mem://preferences/deferred-workstreams.md`).
- Bulk re-ordering / drag handles (Phase 10).
- Replay execution itself — Phase 12 hardening.
