/**
 * Lovable Common — Project Instruction Manifest
 *
 * Shared utility module consumed at runtime by:
 *   - lovable-owner-switch
 *   - lovable-user-add
 *
 * Phase: P1 — exposes XPathKeyCode + DefaultXPaths + DefaultDelaysMs only.
 * Future phases add LovableApiClient (P2/P3) and the shared XPath editor (P18).
 */

import type { SeedBlock } from "../../marco-sdk/src/instruction";

export interface ProjectInstruction {
    schemaVersion: string;
    name: string;
    displayName: string;
    version: string;
    description: string;
    world: "MAIN" | "ISOLATED";
    isGlobal?: boolean;
    dependencies: string[];
    loadOrder: number;
    seed: SeedBlock;
    assets: {
        css: Array<{ file: string; inject: "head" }>;
        configs: Array<{ file: string; key: string; injectAs?: string }>;
        scripts: Array<{ file: string; order: number; configBinding?: string; themeBinding?: string; isIife?: boolean }>;
        templates: Array<{ file: string; injectAs?: string }>;
        prompts: Array<{ file: string }>;
    };
}

const instruction: ProjectInstruction = {
    schemaVersion: "1.0",
    name: "lovable-common",
    displayName: "Lovable Common (XPath + API)",
    version: "1.0.0",
    description: "Shared XPaths, default delays, and (future) LovableApiClient consumed by Lovable Owner Switch and Lovable User Add.",
    world: "MAIN",
    isGlobal: false,
    dependencies: [],
    loadOrder: 5,
    seed: {
        id: "default-lovable-common",
        seedOnInstall: true,
        isRemovable: false,
        autoInject: false,
        runAt: "document_idle",
        cookieBinding: undefined,
        targetUrls: [],
        cookies: [],
        settings: {},
    },
    assets: {
        css: [],
        configs: [],
        scripts: [
            {
                file: "lovable-common.js",
                order: 1,
                isIife: true,
            },
        ],
        templates: [],
        prompts: [],
    },
};

export default instruction;
