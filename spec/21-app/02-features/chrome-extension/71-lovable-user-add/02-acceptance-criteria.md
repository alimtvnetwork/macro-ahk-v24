# Lovable User Add — Acceptance Criteria

1. CSV with columns `LoginEmail, NewMemberEmail, NewMemberRole` (+ optional `Password`, `Notes`) is accepted; missing required columns rejected with a clear validation error.
2. `NewMemberRole` is validated against enum `LovableInvitableRole = { Admin, Member }`. `Editor` is aliased to `Member` (Lovable API convention).
3. SQLite tables `UserAddTask`, `UserAddRow`, `TaskStatus`, `XPathSetting` are created on first load via core SDK migration.
4. Login flow, session-cookie bearer derivation, workspace resolution, and sign-out behave identically to `Lovable Owner Switch`.
5. The membership add call is exactly:
   ```
   POST {ApiBase}/workspaces/{WorkspaceId}/memberships
   { "Email": "<NewMemberEmail>", "Role": "<Admin|Member>" }
   ```
6. On 2xx → row marked `IsDone = true`; on failure → `HasError = true`, `LastError = <stack>`.
7. Sign-out runs after every row regardless of success/failure.
8. Coding rules from `../70-lovable-owner-switch/05-coding-rules-recap.md` apply unchanged (no `!important`, no `as` casts, no `unknown`, no magic strings, ≤100-line files, ≤15-line functions, class-based, blank line before return, pre-write standards check, no unjustified rAF).
9. Shared XPath module `lovable-common-xpath` is the single source for all login/sign-out XPaths and default delays — no duplication between the two scripts.
