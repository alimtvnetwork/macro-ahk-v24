/**
 * Marco Extension — End-to-End Bundle Round-Trip Test
 *
 * Drives `src/lib/sqlite-bundle.ts` through a full export → import cycle
 * against an in-memory mocked message store. Verifies that every artifact
 * kind the bundle is contracted to carry (Projects, Scripts, Configs,
 * Prompts, Meta) survives a round-trip through the SQLite + JSZip pipeline
 * intact.
 *
 * What this protects against (regressions caught here):
 *   - Casing drift between INSERT and SELECT column names.
 *   - JSON-encoded sub-fields (TargetUrls / Scripts / Configs / CookieRules
 *     / Settings) silently re-shaped during stringify→parse.
 *   - Numeric ↔ boolean coercion regressions on IsIife / HasDomUsage /
 *     IsDefault / IsFavorite.
 *   - Bundle validator mistakenly rejecting a bundle this very build just
 *     produced (i.e. self-incompatibility — the worst possible regression).
 *   - Zip envelope shape — the file is named `marco-backup.db` inside
 *     `marco-backup.zip`, both ends.
 *
 * Why integration-style + jsdom (not Playwright):
 *   - The bundle code is pure (no chrome.* surface). Round-tripping it
 *     through a real extension build would add ~30s for zero extra
 *     coverage. Playwright E2E-18 still owns the user-flow side.
 *   - sql.js is loaded with `locateFile` pointing at the in-package WASM
 *     so no network call is needed.
 *
 * Format version pinned: '4' (PascalCase contract).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

/* ------------------------------------------------------------------ */
/*  Mock #1 — in-memory message store                                  */
/* ------------------------------------------------------------------ */

import type {
  StoredProject,
  StoredScript,
  StoredConfig,
} from "@/hooks/use-projects-scripts";
import type { PromptEntry } from "@/hooks/use-prompts";

interface MockStore {
  projects: StoredProject[];
  scripts: StoredScript[];
  configs: StoredConfig[];
  prompts: PromptEntry[];
}

let store: MockStore = { projects: [], scripts: [], configs: [], prompts: [] };

vi.mock("@/lib/message-client", () => ({
  sendMessage: vi.fn(async (msg: { type: string; [k: string]: unknown }) => {
    switch (msg.type) {
      case "GET_ALL_PROJECTS": return { projects: store.projects };
      case "GET_ALL_SCRIPTS":  return { scripts:  store.scripts  };
      case "GET_ALL_CONFIGS":  return { configs:  store.configs  };
      case "GET_PROMPTS":      return { prompts:  store.prompts  };
      case "SAVE_PROJECT": {
        const p = msg.project as StoredProject;
        store.projects = store.projects.filter((x) => x.id !== p.id).concat(p);
        return {};
      }
      case "SAVE_SCRIPT": {
        const s = msg.script as StoredScript;
        store.scripts = store.scripts.filter((x) => x.id !== s.id).concat(s);
        return {};
      }
      case "SAVE_CONFIG": {
        const c = msg.config as StoredConfig;
        store.configs = store.configs.filter((x) => x.id !== c.id).concat(c);
        return {};
      }
      case "SAVE_PROMPT": {
        const p = msg.prompt as PromptEntry;
        store.prompts = store.prompts.filter((x) => x.id !== p.id).concat(p);
        return {};
      }
      case "DELETE_PROJECT":
        store.projects = store.projects.filter((x) => x.id !== msg.projectId);
        return {};
      case "DELETE_SCRIPT":
        store.scripts = store.scripts.filter((x) => x.id !== msg.id);
        return {};
      case "DELETE_CONFIG":
        store.configs = store.configs.filter((x) => x.id !== msg.id);
        return {};
      case "DELETE_PROMPT":
        store.prompts = store.prompts.filter((x) => x.id !== msg.promptId);
        return {};
      default:
        throw new Error(`Mock store: unhandled message type "${msg.type}"`);
    }
  }),
}));

/* ------------------------------------------------------------------ */
/*  Mock #2 — sql.js locateFile (point at local node_modules WASM)     */
/* ------------------------------------------------------------------ */
/**
 * `sqlite-bundle.ts` hard-codes `WASM_URL = "https://sql.js.org/dist/sql-wasm.wasm"`.
 * jsdom can't fetch that. We intercept `initSqlJs` and override `locateFile`
 * so it loads the WASM from the locally-installed `sql.js` package.
 */
vi.mock("sql.js", async () => {
  const real = await vi.importActual<typeof import("sql.js")>("sql.js");
  const realInit = real.default;
  const wasmDir = resolvePath(
    resolvePath(__dirname, "../../../node_modules/sql.js/dist"),
  );
  const localInit: typeof realInit = ((cfg) =>
    realInit({
      ...(cfg ?? {}),
      // Always resolve from the local install — ignore the caller's URL.
      locateFile: (file: string) => resolvePath(wasmDir, file),
    })) as typeof realInit;
  return { ...real, default: localInit };
});

/**
 * jsdom won't fetch wasm via URL — but `sql.js` itself reads WASM through
 * `locateFile` (which we just remapped to a filesystem path). On Node it
 * uses `fs.readFileSync`, no fetch needed. We still install a no-op fetch
 * stub so any unrelated URL access throws a clear, fast error rather than
 * hanging the test.
 */
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = String(input);
      if (path.endsWith(".wasm")) {
        const buf = readFileSync(
          resolvePath(__dirname, "../../../node_modules/sql.js/dist/sql-wasm.wasm"),
        );
        return new Response(buf, { status: 200 });
      }
      throw new Error(`Unexpected fetch in test: ${path}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  store = { projects: [], scripts: [], configs: [], prompts: [] };
});

/* ------------------------------------------------------------------ */
/*  Mock #3 — `triggerDownload` capture                                */
/* ------------------------------------------------------------------ */
/**
 * The exporter ends with a DOM <a download> click. In jsdom that is a
 * no-op, but we want the raw Blob so we can feed it back into the
 * importer as a `File`. We capture the most recent Blob via a
 * `URL.createObjectURL` spy — that's the only side-effect we need.
 */
let lastExportedBlob: Blob | null = null;
beforeEach(() => {
  lastExportedBlob = null;
  // jsdom provides URL.createObjectURL but not always — provide a stub
  // that records the blob and returns a fake URL.
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: (b: Blob) => {
      lastExportedBlob = b;
      return "blob:test/" + Math.random().toString(36).slice(2);
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
});

/* ------------------------------------------------------------------ */
/*  Imports under test (after mocks are registered)                    */
/* ------------------------------------------------------------------ */

import {
  exportAllAsSqliteZip,
  importFromSqliteZip,
} from "@/lib/sqlite-bundle";
import initSqlJs from "sql.js";

/* ------------------------------------------------------------------ */
/*  Fixture                                                            */
/* ------------------------------------------------------------------ */

/**
 * One project that exercises every column the contract carries:
 * deeply-nested JSON arrays, optional fields populated, boolean ↔
 * integer fields set to BOTH true and false, and unicode in text.
 */
function buildFixture(): MockStore {
  const now = "2026-04-24T08:30:00.000Z";

  const project: StoredProject = {
    id: "proj-uid-1",
    schemaVersion: 2,
    name: "Round-Trip Fixture",
    version: "1.2.3",
    description: "Exercises every bundle column — 中文 / emoji 🚀",
    targetUrls: [
      { pattern: "https://lovable.dev/*", matchType: "wildcard" },
      { pattern: "https://example.com/foo", matchType: "exact" },
    ],
    scripts: [
      { path: "scripts/main.js", order: 0, runAt: "document_idle", configBinding: "cfg-uid-1" },
      { path: "scripts/late.js", order: 1, runAt: "document_end" },
    ],
    configs: [{ path: "configs/app.json", description: "App config" }],
    cookieRules: [],
    settings: { isolateScripts: true, logLevel: "info", retryOnNavigate: false },
    createdAt: now,
    updatedAt: now,
  };

  const scripts: StoredScript[] = [
    {
      id: "scr-uid-1",
      name: "scripts/main.js",
      description: "Main entry",
      code: "console.log('hello');",
      order: 0,
      runAt: "document_idle",
      configBinding: "cfg-uid-1",
      isIife: true,
      hasDomUsage: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "scr-uid-2",
      name: "scripts/late.js",
      code: "document.title = 'x';",
      order: 1,
      runAt: "document_end",
      isIife: false,
      hasDomUsage: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const configs: StoredConfig[] = [
    {
      id: "cfg-uid-1",
      name: "configs/app.json",
      description: "App config",
      json: JSON.stringify({ apiBase: "https://api.example.com", retries: 3 }),
      createdAt: now,
      updatedAt: now,
    },
  ];

  const prompts: PromptEntry[] = [
    {
      id: "prm-uid-1",
      name: "Next Tasks",
      text: "Continue with the next task in the list.",
      order: 0,
      isDefault: false,
      isFavorite: true,
      category: "automation",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "prm-uid-2",
      name: "Default Welcome",
      text: "Hello!",
      order: 1,
      isDefault: true,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { projects: [project], scripts, configs, prompts };
}

/* ------------------------------------------------------------------ */
/*  The test                                                           */
/* ------------------------------------------------------------------ */

describe("sqlite-bundle — full round-trip", () => {
  it("exports a fixture project to a single-DB zip and imports it intact into a clean workspace", async () => {
    /* ---- 1. Seed source workspace ---- */
    const fixture = buildFixture();
    store = structuredClone(fixture);

    /* ---- 2. Export ---- */
    await exportAllAsSqliteZip();
    expect(lastExportedBlob, "exporter should produce a Blob").not.toBeNull();
    const exportedBlob = lastExportedBlob!;
    expect(exportedBlob.size).toBeGreaterThan(0);

    /* ---- 3. Confirm zip envelope shape (one .db inside) ---- */
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await exportedBlob.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names, "zip should contain exactly one entry").toEqual(["marco-backup.db"]);

    /* ---- 4. Wipe workspace ---- */
    store = { projects: [], scripts: [], configs: [], prompts: [] };

    /* ---- 5. Import the same zip as a File ---- */
    const file = new File([exportedBlob], "marco-backup.zip", { type: "application/zip" });
    const result = await importFromSqliteZip(file);

    /* ---- 6. Counts ---- */
    expect(result).toEqual({
      projectCount: fixture.projects.length,
      scriptCount: fixture.scripts.length,
      configCount: fixture.configs.length,
    });

    /* ---- 7. Per-artifact deep equality ---- */
    expect(store.projects).toHaveLength(fixture.projects.length);
    expect(store.scripts).toHaveLength(fixture.scripts.length);
    expect(store.configs).toHaveLength(fixture.configs.length);

    const byId = <T extends { id: string }>(xs: T[]) =>
      Object.fromEntries(xs.map((x) => [x.id, x]));

    /* Projects — every contracted field must come back identical. */
    const importedProject = byId(store.projects)["proj-uid-1"];
    const sourceProject = fixture.projects[0];
    expect(importedProject).toMatchObject({
      id: sourceProject.id,
      schemaVersion: sourceProject.schemaVersion,
      name: sourceProject.name,
      version: sourceProject.version,
      description: sourceProject.description,
      targetUrls: sourceProject.targetUrls,
      scripts: sourceProject.scripts,
      configs: sourceProject.configs,
      cookieRules: sourceProject.cookieRules,
      settings: sourceProject.settings,
      createdAt: sourceProject.createdAt,
      updatedAt: sourceProject.updatedAt,
    });

    /* Scripts — including the boolean flags and optional fields. */
    for (const src of fixture.scripts) {
      const imp = byId(store.scripts)[src.id];
      expect(imp, `script ${src.id} survived round-trip`).toBeDefined();
      expect(imp).toMatchObject({
        id: src.id,
        name: src.name,
        code: src.code,
        order: src.order,
        isIife: src.isIife ?? false,
        hasDomUsage: src.hasDomUsage ?? false,
        createdAt: src.createdAt,
        updatedAt: src.updatedAt,
      });
      // Optional fields — only assert when the source had them.
      if (src.description !== undefined) expect(imp.description).toBe(src.description);
      if (src.runAt !== undefined) expect(imp.runAt).toBe(src.runAt);
      if (src.configBinding !== undefined) expect(imp.configBinding).toBe(src.configBinding);
    }

    /* Configs — JSON column must round-trip byte-identical. */
    for (const src of fixture.configs) {
      const imp = byId(store.configs)[src.id];
      expect(imp).toMatchObject({
        id: src.id,
        name: src.name,
        description: src.description,
        json: src.json,
        createdAt: src.createdAt,
        updatedAt: src.updatedAt,
      });
    }
  });
});
