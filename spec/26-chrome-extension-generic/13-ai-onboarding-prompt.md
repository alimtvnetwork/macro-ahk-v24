# AI Onboarding Prompt

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be finalised after body sections are authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## The Single Prompt

Paste the following into a fresh AI session that has access to the project repository:

> You are bootstrapping a new Chrome MV3 extension. Read every file in
> `spec/26-chrome-extension-generic/` in numeric order, then execute the
> 10-step build checklist below without asking questions unless you
> encounter an explicit `<ASK>` marker in the spec.

---

## 10-Step Build Checklist

1. Create the folder skeleton from `02-folder-and-build/01-repository-layout.md`.
2. Copy every template from `12-templates/`, substituting the five canonical tokens (`<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>`).
3. Run `npm install` with the exact dependency list in `02-folder-and-build/05-package-json-scripts.md`.
4. Wire `eslint.config.js` per `03-typescript-and-linter/02-eslint-config.md` and verify **zero warnings**.
5. Implement `NamespaceLogger` and `AppError` per `07-error-management/`.
6. Implement `platform-adapter` and `chrome-adapter` per `04-architecture/04-platform-adapter.md`.
7. Implement the message relay per `04-architecture/03-message-relay.md`.
8. Implement the chosen storage tier(s) per `05-storage-layers/`.
9. Implement Options shell + Popup shell + (optional) injected controller per `06-ui-and-design-system/`.
10. Run `npm run build && npm run package`. Verify the produced ZIP loads cleanly via `chrome://extensions → Load unpacked`.

---

## Stop conditions

The AI MUST stop and ask the human when it encounters any of:

- An `<ASK>` marker in any spec file.
- A required template token whose value is not provided in the prompt.
- A test or validator failing **after** following the spec exactly.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Folder index | `./00-overview.md` |
| Templates | `./12-templates/00-overview.md` |
| Acceptance criteria | `./97-acceptance-criteria.md` |
