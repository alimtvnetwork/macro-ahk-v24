# SQLite Schema Conventions

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Medium (intent captured, body pending)

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Intent

Define PascalCase table names, JsonSchemaDef format for declarative schemas, additive-only column migration policy, foreign-key conventions, validation rules per column, and the CREATE IF NOT EXISTS migration approach.

---

## Source material to distill (private — do NOT cite in final body)

`spec/04-database-conventions/`, `spec/22-app-issues/86-…` (subsystem 2.5 + 2.6)

---

## Required sections (when authored)

1. Concept summary (≤ 3 paragraphs).
2. Reference diagram or table.
3. Interface / signature / config snippets (TypeScript only).
4. Reference implementation excerpt (≤ 30 lines).
5. Common pitfalls table.
6. `DO` / `DO NOT` / `VERIFY` checklist.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
| Required files | `../../01-spec-authoring-guide/03-required-files.md` |
