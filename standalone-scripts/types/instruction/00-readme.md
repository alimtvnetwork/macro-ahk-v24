# Global Instruction Types — Draft for Review

**Status**: 🟢 Q1–Q4 locked (2026-04-24) — see `spec/21-app/01-chrome-extension/standalone-scripts-types/01-overview.md` §5. Build-out of the 19 files is unblocked. Q5 (runtime base class) is deferred and does not block.
**Target consumers**: every standalone script (`marco-sdk`, `xpath`, `macro-controller`, `payment-banner-hider`, …).
**Goal**: replace each project's local `ProjectInstruction` interface, ad-hoc string unions (`"MAIN" | "ISOLATED"`, `"glob" | "regex"`, `"document_idle" | "document_end"`), and inline array element types with a single shared, strongly-typed contract.

## Conventions enforced in this folder

1. **One type per file** — file name = type name in `kebab-case.ts`.
2. **`type` only** — never `interface` (project preference: stick to one keyword).
3. **No `unknown`, no `any`** — every leaf is either a concrete type, an enum, or `T` generic.
4. **No in-place definitions** — array element types, function parameter shapes, and union members all live in their own files and are imported by name.
5. **Full names, no abbreviations** — `cookieName` not `ckName`, `injectionWorld` not `world`, `compileFunction` not `compileFn`.
6. **Enums for closed string unions** — `InjectionWorld`, `InjectionRunAt`, `XPathKind`, `MatchType`, `AssetInjectTarget`. (See `enums/`.)

## File layout

```
standalone-scripts/types/instruction/
├── 00-readme.md                          ← this file
├── enums/
│   ├── injection-world.ts
│   ├── injection-run-at.ts
│   ├── match-type.ts
│   ├── xpath-kind.ts
│   └── asset-inject-target.ts
├── primitives/
│   ├── version-string.ts
│   ├── url-pattern.ts
│   └── identifier.ts
├── xpath/
│   ├── xpath-direct-entry.ts
│   ├── xpath-relative-entry.ts
│   ├── xpath-entry.ts                    ← discriminated union
│   ├── xpath-group.ts
│   └── xpath-registry.ts
├── assets/
│   ├── css-asset.ts
│   ├── config-asset.ts
│   ├── script-asset.ts
│   ├── template-asset.ts
│   ├── prompt-asset.ts
│   └── asset-bundle.ts
├── seed/
│   ├── target-url.ts
│   ├── cookie-binding.ts
│   ├── cookie-spec.ts
│   ├── empty-settings.ts
│   └── seed-block.ts
├── dependency/
│   └── project-dependency.ts
└── project-instruction.ts                ← top-level type that composes everything
```

## Decisions (locked 2026-04-24)

| # | Question | Decision | Rationale (full version in spec §5) |
|---|----------|----------|--------------------------------------|
| Q1 | `enum` vs. `as const` | **`export const enum`** with explicit string members | Zero runtime cost, no magic strings at call sites, matches files already shipped in `enums/` |
| Q2 | `xpaths` optional or required | **Optional** (`xpaths?: XPathRegistry`) | `marco-sdk` and `payment-banner-hider` have zero XPaths; sentinel value would violate "no in-place definitions" |
| Q3 | `EmptySettings` alias or inline | **Named alias** in `seed/empty-settings.ts` | Reviewer rule "no in-place definitions"; one grep target lists every settings-less script |
| Q4 | Long names everywhere | **Yes** — `injectionWorld`, `injectionRunAt`, `isImmediatelyInvokedFunction`, `injectInto` | Reviewer rule "no FN-style abbreviations"; avoids collision with Chrome's own `runAt`; ESLint `id-denylist` will block the old names after migration |
| Q5 | Runtime `StandaloneScript` base class | 🟡 **Deferred** — does not block this build-out | Will be designed after `PaymentBannerHider` class rewrite (plan 0.11) provides a reference implementation |

The 19-file build-out is now unblocked. Migration order is tracked in `plan.md` Priority 0 (items 0.2–0.6).
