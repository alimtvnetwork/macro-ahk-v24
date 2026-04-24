# Standalone Scripts — Global Instruction Types

**Status**: 🟡 Draft — awaiting review on Q1–Q5.
**Owner**: Riseup Asia LLC
**Source folder**: `standalone-scripts/types/instruction/`
**Driving conversation**: 2026-04-24 chat with reviewer (logged here in full so nothing is lost).

---

## 1. Problem statement

Today every standalone script (`marco-sdk`, `xpath`, `macro-controller`, `payment-banner-hider`) declares **its own** `ProjectInstruction` interface inside its local `src/instruction.ts`. The shapes have already drifted:

- `world: "MAIN" | "ISOLATED"` is repeated as a string union in four files.
- `runAt: "document_idle" | "document_end"` is sometimes typed, sometimes left as `string`.
- `assets.scripts` uses an in-place array element type (`Array<{ file; order; isIife? }>`) — every script copy-pastes a slightly different version.
- XPath storage is ad-hoc: most scripts hard-code selectors inside their bundle. There is no shared way to declare grouped or relative XPaths.
- `interface` and `type` keywords are mixed across the codebase.
- The runtime namespace types (`riseup-namespace.d.ts`) still surface `unknown` in `Logger.error`, `Logger.console`, `Logger.stackTrace` — these escape the policy because the policy only forbids `unknown` *in code*, not in `.d.ts` ambient declarations.

## 2. Reviewer requirements (verbatim, distilled)

> "We should have a globally defined class or type which everyone should inherit … just like the instruction, instruction could have like additional parameters."

→ Single `ProjectInstruction<TSettings>` shared by every script. Project-specific parts flow through generics.

> "Not the world as main or isolated, but have like proper enum."

→ Replace `"MAIN" | "ISOLATED"` with `enum InjectionWorld`. Same treatment for `runAt`, XPath kind, match type, and asset inject target.

> "Rather than just mentioning the array in-place type, try to have a specific and other types."

→ Every array element type lives in its own named file: `CssAsset`, `ConfigAsset`, `ScriptAsset`, `TemplateAsset`, `PromptAsset`, `TargetUrl`, `CookieSpec`, `ProjectDependency`, `XPathEntry`, `XPathGroup`.

> "There should be one display name, another is the name."

→ Keep `name` (Identifier, kebab-case) and `displayName` (human-readable) as separate fields — already correct, formalised here.

> "The XPath section could have grouped XPath. That means in that case, you'll have a name of the group, and then inside that, that would have a wrapping XPath. So for the XPath, it could have like two ways. One would be the direct XPath … There could be relative XPath, so relative to what? So there would be another like root variable along with that, it would be combining with."

→ Discriminated union `XPathEntry = XPathDirectEntry | XPathRelativeEntry`. Direct entries carry a complete XPath. Relative entries carry a fragment plus a `relativeTo: Identifier` pointing at the parent entry (resolved at runtime). `XPathGroup` carries a `name`, an optional `wrappingXPath`, and a list of `XPathEntry`. `XPathRegistry` aggregates top-level entries plus groups.

> "Standard scripts, there should be something called global types, project … types I believe."

→ Lives at `standalone-scripts/types/` (already present). New `instruction/` subfolder hosts these types so the existing `riseup-namespace.d.ts` and `project-namespace-shape.d.ts` are not disturbed.

> "Each one of the types should be its own file."

→ One file per type. Folder layout in `instruction/00-readme.md`.

> "Make sure that we do not type the definitions in place. The definitions should be in other files, not in place."

→ Every type used as a property type, generic parameter, array element, or function parameter MUST be imported by name. Inline object types are forbidden.

> "Do not name things like FN. If it is function name, write the full form."

→ ESLint `id-denylist` rule banning `fn`, `cb`, `el`, `msg`, `cfg`, `ctx`, `obj`, `arr`, `str`, `num`, `tmp`, `val`. Renames in this draft: `isIife` → `isImmediatelyInvokedFunction`, `world` → `injectionWorld`, `inject` → `injectInto`.

> "Either use interface or use types. Don't use a mixture of it … let's go with the type rather than interface."

→ Every file in `standalone-scripts/types/instruction/` uses `type`. ESLint `@typescript-eslint/consistent-type-definitions: ["error", "type"]` will be enabled scoped to this folder once the migration completes.

> "Do not have any unknown. Inside the namespace log API, I do see lots of unknowns."

→ Tracked as a follow-up: `Logger.error(functionName, message, error?: CaughtError)`, `Logger.console(functionName, message, ...args: ReadonlyArray<JsonValue>)`, `Logger.stackTrace(functionName, message, error?: CaughtError)`. `CaughtError` and `JsonValue` already exist in the codebase.

> "Why the linter is not finding it or breaking it, that is another question."

→ Root cause: the `unknown` policy ESLint rule is registered on `.ts` files but excludes `.d.ts`. Fix: extend the same rule to ambient declarations under `standalone-scripts/types/`. Tracked as a separate plan item.

## 3. File-by-file inventory

See `standalone-scripts/types/instruction/00-readme.md` for the full tree. Highlights:

- **`enums/`** — `InjectionWorld`, `InjectionRunAt`, `MatchType`, `XPathKind`, `AssetInjectTarget`. All `const enum` with explicit string values for JSON compatibility.
- **`primitives/`** — `Identifier`, `VersionString`, `UrlPattern`. Branded strings to prevent accidental cross-assignment.
- **`xpath/`** — `XPathDirectEntry`, `XPathRelativeEntry`, `XPathEntry` (union), `XPathGroup`, `XPathRegistry`.
- **`assets/`** — `CssAsset`, `ConfigAsset`, `ScriptAsset`, `TemplateAsset`, `PromptAsset`, `AssetBundle`.
- **`seed/`** — `TargetUrl`, `CookieBinding`, `CookieSpec`, `EmptySettings`, `SeedBlock<TSettings>`.
- **`dependency/`** — `ProjectDependency`.
- **`project-instruction.ts`** — `ProjectInstruction<TSettings>` composing all of the above.

## 4. Migration impact (no code touched yet)

| Project | Local type to delete | Replacement |
|---|---|---|
| `marco-sdk/src/instruction.ts` | `ProjectInstruction`, `SeedBlock` | `ProjectInstruction<EmptySettings>`, `SeedBlock<EmptySettings>` |
| `xpath/src/instruction.ts` | local `ProjectInstruction` | `ProjectInstruction<EmptySettings>` |
| `macro-controller/src/instruction.ts` | local `ProjectInstruction`, settings inline shape | `ProjectInstruction<MacroControllerSettings>` (settings type added next to controller) |
| `payment-banner-hider/src/instruction.ts` | local `ProjectInstruction` | `ProjectInstruction<EmptySettings>` |

`scripts/compile-instruction.mjs` reads `instruction.ts` via `tsx` and writes `instruction.json`. The JSON shape on disk must stay byte-identical post-migration so the runtime loader and `check-standalone-dist.mjs` keep passing. Field-rename mapping (`world` → `injectionWorld`, `isIife` → `isImmediatelyInvokedFunction`, `inject` → `injectInto`) is opt-in: `compile-instruction.mjs` will emit the legacy keys for one release cycle so the runtime can be migrated independently.

## 5. Open review points

These match `00-readme.md` and the questions in the closing summary — re-stated here so the spec is self-contained.

- **Q1** — `enum` keyword vs. `as const` literal-unions for `InjectionWorld`, `XPathKind`, etc.?
- **Q2** — `ProjectInstruction.xpaths?: XPathRegistry` — optional or required?
- **Q3** — `EmptySettings` named alias vs. inline `Record<string, never>`?
- **Q4** — Names: `injectionWorld` vs. keep legacy `world`? Same for `runAt` → `injectionRunAt`?
- **Q5** — Should each script also extend a runtime `StandaloneScript` base class (separate from these types)?

## 6. Out of scope for this spec

- The runtime `PaymentBannerHider` class refactor (separate plan item — covered by the prior banner RCA).
- The Logger `unknown` cleanup in `riseup-namespace.d.ts` (separate plan item — depends on `CaughtError`/`JsonValue` audit).
- The standalone-script scaffolder CLI (separate plan item).
