# Lovable User Add — Overview

**Status**: 📋 Pending (spec-only, deferred for later implementation)
**Project type**: Standalone script inside the macro Chrome extension
**Companion project**: `Lovable Owner Switch` (see `spec/21-app/02-features/chrome-extension/70-lovable-owner-switch/`)
**Shared module**: `Lovable Common XPath`
**Date authored**: 2026-04-24

---

## 1. Purpose

Bulk-add new members to a Lovable workspace by email, with a chosen role
(`Admin`, `Member`/`Editor`). Driven from a CSV uploaded by the user.
Mechanically identical to `Lovable Owner Switch` except for the final REST
call and the CSV column set.

## 2. Project identity

| Field | Value |
|---|---|
| Project name | `Lovable User Add` |
| Script slug | `lovable-user-add` |
| Lives under | `standalone-scripts/lovable-user-add/` |
| Shared XPath module | `lovable-common-xpath` (same module as `Lovable Owner Switch`) |
| Default URL targets | `https://lovable.dev/login`, `https://api.lovable.dev/*` |
| Default browser mode | Incognito (toggle exposed in popup) |

## 3. Difference vs. Lovable Owner Switch

| Aspect | Owner Switch | User Add |
|---|---|---|
| Pre-condition | Target user is already a workspace member | Target user is NOT yet a member |
| REST verb / path | `PUT .../memberships/{UserId}` | `POST .../memberships` |
| REST body | `{"Role":"Owner"}` | `{"Email":"<addr>","Role":"<Admin\|Member>"}` |
| User ID lookup needed? | Yes (email → UserId) | No — the API resolves email server-side |
| CSV columns | LoginEmail, Password, OwnerEmail1, OwnerEmail2, Notes | LoginEmail, Password, NewMemberEmail, NewMemberRole, Notes |

Everything else (login flow, session cookie → bearer, workspace resolution,
sign-out, SQLite schema shape, settings table, file manager, popup UI,
coding rules) is reused from the Owner Switch spec.

## 4. End-to-end flow (one row)

1. **Pre-flight** — validate row (`LoginEmail`, `NewMemberEmail`, `NewMemberRole ∈ {Admin, Member}`).
2. **Launch** browser (incognito if enabled), navigate to `LoginUrl`.
3. **Login** (LoginEmailInput → ContinueButton → PasswordInput → LoginButton).
4. **Confirm** session via `WorkspaceButton` XPath.
5. **Bearer** from Lovable session cookie.
6. **Workspace** resolution: `GET {ApiBase}/workspaces` → pick `WorkspaceId`.
7. **Add member**:
   ```
   POST {ApiBase}/workspaces/{WorkspaceId}/memberships
   { "Email": "<NewMemberEmail>", "Role": "<NewMemberRole>" }
   ```
8. On 2xx → `IsDone = true`. On error → `HasError = true`, `LastError = <stack>`.
9. Sign out (Profile → Sign Out).
10. Next row.

## 5. CSV columns

| Column | Required | Notes |
|---|---|---|
| LoginEmail | Yes | Lovable controller account |
| Password | No | Optional; falls back to common-password UI text box |
| NewMemberEmail | Yes | Email to invite |
| NewMemberRole | Yes | Enum: `Admin`, `Member` (validated; `Editor` aliased to `Member` per Lovable API) |
| Notes | No | Free text |

## 6. Database schema

Identical structure to Owner Switch but renamed:

- `UserAddTask` (master) — same fields as `OwnerSwitchTask`.
- `UserAddRow` (child) — fields:
  `Id, TaskId, LoginEmail, Password, NewMemberEmail, NewMemberRole, Notes,
  IsDone, HasError, LastError, WorkspaceId`.
- `TaskStatus` — same lookup enum (`Pending`, `Running`, `Completed`, `Failed`).
- `XPathSetting` — shared via `lovable-common-xpath` defaults.

## 7. Acceptance criteria

See `02-acceptance-criteria.md`.

## 8. References

- Verbatim transcript: shared with Owner Switch — see
  `../70-lovable-owner-switch/99-verbatim.md` (the user delivered both specs
  in the same message; this companion file links back rather than duplicating).
- Coding rules: same as `../70-lovable-owner-switch/05-coding-rules-recap.md`.

---

> **Status note**: Spec-only. Do NOT implement until scheduled in
> `.lovable/plan.md`.
