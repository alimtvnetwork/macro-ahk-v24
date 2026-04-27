---
name: features/macro-controller/pro-zero-credit-balance
description: TO-DO — when WorkspacePlan === PRO_ZERO, fetch /credit-balance and use total_granted/total_remaining/total_billing_period_used; cache in IndexedDB ≥10min + async SQLite Workspaces upsert; right-click copies both JSONs
type: feature
status: TO-DO (awaiting `next` to implement)
spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md
---

## Summary

When the workspaces endpoint returns `plan: "pro_0"`, the existing in-controller credit calculation is replaced by a single GET to `/workspaces/{WorkspaceId}/credit-balance`. For every other plan the existing calculation is unchanged.

## Mapping (PRO_ZERO only)

- `MacroCreditSummary.Total`            ← `CreditBalanceResponse.total_granted`
- `MacroCreditSummary.AvailableCredits` ← `CreditBalanceResponse.total_remaining`
- `MacroCreditSummary.TotalUsed`        ← `CreditBalanceResponse.total_billing_period_used`
- `MacroCreditSummary.Source`           ← `MacroCreditSource.CREDIT_BALANCE`

## Hard rules

- `WorkspacePlan` is an Enum — raw `"pro_0"` lives only in the wire-to-Enum mapper.
- Function ≤ 8 lines, file ≤ 100 lines, no nested `if`, no negative `if`, no `any`/`unknown`/casts, definitions in their own files.
- Every `catch` logs via existing `RiseupAsiaMacroExt.Logger.error` — no swallowed errors.
- `Authorization` header redacted in every log line.
- On HTTP/network/parse failure, return typed error result; **no silent fallback** to old calc.

## Cache + persistence

- IndexedDB short-term cache, TTL ≥ 10 minutes, configurable via `Settings.ProZeroCreditBalanceCacheTtlMinutes` (default 10).
- SQLite `Workspaces` table (`WorkspaceId PK`, `WorkspaceJson`, `CreditBalanceJson`, `Plan`, `FetchedAt`) — async upsert on success.
- Right-click on a `pro_0` workspace row copies `{ Workspace, CreditBalance }` JSON to the clipboard.

## Implementation order (on `next`)

1. New files for: `WorkspacePlan`, `CreditGrantType`, `CreditBalanceFetchStatus`, `CreditBalanceLogEvent`, `MacroCreditSource` (Enums).
2. New files for: `WorkspaceInfo`, `WorkspaceMembership`, `CreditBalanceResponse`, `ExpiringGrant`, `GrantTypeBalance`, `MacroCreditSummary`, `CreditBalanceFetchResult` (types).
3. Constants file: `WORKSPACES_ENDPOINT_TEMPLATE`, `CREDIT_BALANCE_ENDPOINT_TEMPLATE`, header keys, redaction placeholder.
4. Wire-to-Enum mapper file (sole place where `"pro_0"` appears).
5. `CreditBalanceClient.fetch(WorkspaceId, BearerToken): Promise<CreditBalanceFetchResult>`.
6. IndexedDB cache module + Settings entry.
7. SQLite `Workspaces` migration + async upsert.
8. Controller integration — branch on `WorkspacePlan`.
9. Right-click context menu entry on `pro_0` workspace rows.
10. Tests using same Enums/constants — no duplication.

## Reference

Full spec: `spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md`
