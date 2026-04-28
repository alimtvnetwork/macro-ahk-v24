# Database Diagrams

Mermaid sources for all database ERDs and storage-layer overviews.

| File | Topic |
|---|---|
| `01-extension-db.mmd` | Extension SQLite bundle (logs.db / errors.db) — Sessions, Logs, Errors, Prompts, Updater\*, SharedAsset, AssetVersion |
| `02-project-recorder-db.mmd` | Per-project Macro Recorder DB (Phase 14 chain columns + StepTag) |
| `03-step-group-library.mmd` | Step Group Library hierarchy + RunGroup linking |
| `04-storage-layers.mmd` | 4-tier storage overview (SQLite / IndexedDB / LocalStorage / chrome.storage) |

## Render to PNG

```bash
node scripts/render-db-diagrams.mjs
```

Outputs land in `../images/`. The script uses `npx @mermaid-js/mermaid-cli`
on demand — no permanent dev dependency.

## Style

All diagrams follow `mem://style/diagram-visual-standards`:
- PascalCase labels
- XMind-inspired dark aesthetic for `flowchart` diagrams
- Top-down (`flowchart TD`) where applicable
- ER diagrams use plain `erDiagram` — Mermaid renders them with the active theme
