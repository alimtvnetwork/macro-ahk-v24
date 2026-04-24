---
name: PascalCase JSON keys everywhere
description: All instruction.json keys (and their TypeScript source counterparts) must be PascalCase — Name, DisplayName, Version, World, RunAt, IsIife, Inject, etc. No long-name renames; case change only.
type: preference
---

# PascalCase JSON keys everywhere

**Decision date**: 2026-04-25 (user direction during the `ProjectInstruction` migration session).

Every key in every standalone-script `instruction.json` (and therefore every source-side TS object key in each `instruction.ts`) MUST be `PascalCase`. This is a **case-only** convention — the underlying field semantics do not change.

## Mapping (legacy camelCase → canonical PascalCase)

| Legacy key | New key |
|---|---|
| `schemaVersion` | `SchemaVersion` |
| `name` | `Name` |
| `displayName` | `DisplayName` |
| `version` | `Version` |
| `description` | `Description` |
| `world` | `World` |
| `isGlobal` | `IsGlobal` |
| `dependencies` | `Dependencies` |
| `loadOrder` | `LoadOrder` |
| `seed` | `Seed` |
| `assets` | `Assets` |
| `id` | `Id` |
| `seedOnInstall` | `SeedOnInstall` |
| `isRemovable` | `IsRemovable` |
| `autoInject` | `AutoInject` |
| `runAt` | `RunAt` |
| `cookieBinding` | `CookieBinding` |
| `targetUrls` | `TargetUrls` |
| `cookies` | `Cookies` |
| `settings` | `Settings` |
| `configSeedIds` | `ConfigSeedIds` |
| `pattern` | `Pattern` |
| `matchType` | `MatchType` |
| `cookieName` | `CookieName` |
| `url` | `Url` |
| `role` | `Role` |
| `description` | `Description` |
| `css` / `configs` / `scripts` / `templates` / `prompts` | `Css` / `Configs` / `Scripts` / `Templates` / `Prompts` |
| `file` | `File` |
| `inject` (on css asset) | `Inject` |
| `key` (on config asset) | `Key` |
| `injectAs` | `InjectAs` |
| `order` | `Order` |
| `configBinding` | `ConfigBinding` |
| `themeBinding` | `ThemeBinding` |
| `isIife` | `IsIife` |

## Why
- Stylistic consistency across the SQLite schema (already PascalCase per logging-data-contract).
- Removes the runtime camelCase ⇄ PascalCase remapping noise documented in `mem://architecture/logging-data-contract`.
- One single naming convention for every JSON the extension handles.

## How to apply

1. **Rename source-side keys** in every `standalone-scripts/*/src/instruction.ts` to the table above.
2. **Adopt the shared type** `ProjectInstruction<TSettings>` from `standalone-scripts/types/instruction/` — but the shared type's field names must be the PascalCase ones in this rule, **not** the long camelCase names from the original Q4 draft.
3. **Update every consumer** that reads `instruction.json` keys (background handlers, manifest-seeder, project-matcher, default-project-seeder, options UI, etc.) to use the new PascalCase keys.
4. **Compile & runtime**: `compile-instruction.mjs` performs a literal eval — no remapping needed; PascalCase in the TS source becomes PascalCase in the JSON.
5. **Pre-merge grep**: `grep -rn "world\|runAt\|isIife\|loadOrder\|displayName" src/background/ chrome-extension/` must return zero hits on instruction-shaped objects after migration.

## Supersedes
- `standalone-scripts/types/instruction/00-readme.md` Q4 (long camelCase names: `injectionWorld`, `injectionRunAt`, `isImmediatelyInvokedFunction`, `injectInto`). Q4 is **withdrawn** in favour of this PascalCase rule.
