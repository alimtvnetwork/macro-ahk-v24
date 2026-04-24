/**
 * Lovable User Add — Project Instruction Manifest
 *
 * Phase P11 scaffold: declares dependency on `lovable-common` (XPaths +
 * LovableApiClient) and registers the empty `LovableUserAdd` entry
 * class. Migrations (P12), CSV (P13), UI (P14) and flow (P15–P17) plug
 * in via subsequent phases without changing this manifest's shape.
 *
 * R12 invariant: Step B (Owner promotion) MUST call the shared
 * `LovableApiClient.promoteToOwner(...)` — same call site Owner Switch
 * uses. No separate PUT implementation in this project.
 */

import type { ProjectInstruction } from "../../lovable-common/src/instruction";

const instruction: ProjectInstruction = {
    schemaVersion: "1.0",
    name: "lovable-user-add",
    displayName: "Lovable User Add",
    version: "2.230.0",
    description: "Bulk-add Lovable workspace members from a CSV; promotes Owner rows via shared promoteToOwner.",
    world: "MAIN",
    isGlobal: false,
    dependencies: ["lovable-common"],
    loadOrder: 61,
    seed: {
        id: "default-lovable-user-add",
        seedOnInstall: true,
        isRemovable: false,
        autoInject: false,
        runAt: "document_idle",
        cookieBinding: undefined,
        targetUrls: [{ pattern: "https://lovable.dev/*", matchType: "glob" }],
        cookies: [],
        settings: {},
    },
    assets: {
        css: [],
        configs: [],
        scripts: [
            {
                file: "lovable-user-add.js",
                order: 1,
                isIife: true,
            },
        ],
        templates: [],
        prompts: [],
    },
};

export default instruction;
