/**
 * Lovable Owner Switch — Project Instruction Manifest
 *
 * Phase P4 scaffold: declares dependency on `lovable-common` (XPaths +
 * LovableApiClient) and registers the empty `LovableOwnerSwitch` entry
 * class. Migrations (P5), CSV (P6), UI (P7) and flow (P8–P10) plug in
 * via subsequent phases without changing this manifest's shape.
 */

import type { ProjectInstruction } from "../../lovable-common/src/instruction";

const instruction: ProjectInstruction = {
    schemaVersion: "1.0",
    name: "lovable-owner-switch",
    displayName: "Lovable Owner Switch",
    version: "2.230.0",
    description: "Bulk-switch Lovable workspace ownership from a CSV of LoginEmail → OwnerEmail rows.",
    world: "MAIN",
    isGlobal: false,
    dependencies: ["lovable-common"],
    loadOrder: 60,
    seed: {
        id: "default-lovable-owner-switch",
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
                file: "lovable-owner-switch.js",
                order: 1,
                isIife: true,
            },
        ],
        templates: [],
        prompts: [],
    },
};

export default instruction;
