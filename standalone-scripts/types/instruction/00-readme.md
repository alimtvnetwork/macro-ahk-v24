# Global Instruction Types — Draft for Review

**Status**: 🟡 Draft proposal — no project code imports from here yet.
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

## Open review points (please answer before any project migrates)

1. **Q1** — `enum` keyword vs. `as const` literal-unions for `InjectionWorld`, `XPathKind`, etc.?
2. **Q2** — `ProjectInstruction.xpaths?: XPathRegistry` — optional or required?
3. **Q3** — `EmptySettings` named alias vs. inline `Record<string, never>`?
4. **Q4** — Names: `injectionWorld` vs. keep legacy `world`? Same for `runAt` → `injectionRunAt`?
5. **Q5** — Should each script also extend a runtime `StandaloneScript` base class (separate from these types)?

Once you sign off, I'll wire the migration and delete the per-project duplicates.
