# Changelog — Generic Chrome Extension Blueprint

**Version:** 1.1.0
**Updated:** 2026-04-24

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## History

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-24 | 1.1.0 | **Templates authored.** Replaced all 15 placeholder stubs in `12-templates/` with full copy-paste-ready artifacts: MV3 manifest, three tsconfig variants (app/sdk/node), two Vite configs (extension/SDK IIFE), flat ESLint config, Tailwind config, HSL design-tokens CSS, AppError model, platform-adapter interface, chrome-adapter implementation, NamespaceLogger, three-tier message-relay client, package.json baseline. All canonical tokens (`<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>`) marked with header banners. Generification grep clean. |
| 2026-04-24 | 1.0.0 | Initial folder skeleton scaffolded — `00-overview.md`, `01-fundamentals.md`, 11 sub-folders with `00-overview.md` placeholders, 12 sub-section placeholders per area, 15 template stubs, governance files. Body sections pending authoring per `.lovable/plan-26-chrome-extension-generic.md`. |
