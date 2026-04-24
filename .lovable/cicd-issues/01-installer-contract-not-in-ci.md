# `check:installer-contract` not wired into installer-tests workflow

## Pipeline / Workflow
`.github/workflows/installer-tests.yml`

## Description
The drift detector `scripts/check-installer-contract.mjs` was added in v2.228.0 to enforce that `scripts/install.sh`, `scripts/install.ps1`, and the generated `installer-constants.{sh,ps1}` stay in sync with `scripts/installer-contract.json` (single source of truth for repo, semver regex, exit codes, flags, endpoints, sibling-discovery defaults, checksum settings, AC-IDs).

It runs locally and is correctly wired into `package.json` as `check:installer-contract`, but it is **not** invoked by the CI workflow. A future drift between the two installers (like the long-standing default-repo bug — `install.ps1` hardcoded to `macro-ahk-v21` while `install.sh` used `macro-ahk-v23`) could land on `main` without being caught.

## First Seen
2026-04-24 (introduced with the shared installer contract)

## Root Cause
The contract + drift detector were shipped in the same session as the AC-2 main-branch fallback work; the CI integration task was logged in `plan.md` (Pending #5) but never executed.

## Status
⏳ Pending

## Fix
Add a step to `.github/workflows/installer-tests.yml`:

```yaml
- name: Check installer contract drift
  run: node scripts/check-installer-contract.mjs
```

It should run **before** the resolver suite and the mock-server suite, so a drift fails fast before any installer behavior is exercised.

## Prevention
- Every new "single source of truth" generator (like `installer-contract.json` → `installer-constants.{sh,ps1}`) MUST land with its CI step in the same PR.
- Add a memory rule: contract generators require CI enforcement.

## References
- `scripts/installer-contract.json`
- `scripts/check-installer-contract.mjs`
- `scripts/generate-installer-constants.mjs`
- `.lovable/plan.md` Pending #5
- Memory: `mem://workflow/14-session-2026-04-23-ts-migration-v2-cleared` (next session note)
