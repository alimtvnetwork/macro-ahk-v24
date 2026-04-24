/**
 * Payment Banner Hider — Project Instruction Manifest
 *
 * Auto-injected global script. Hides the Lovable "Payment issue detected"
 * sticky banner on lovable.dev/* pages with a smooth CSS3 fade.
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
    name: "payment-banner-hider",
    displayName: "Payment Banner Hider",
    version: "2.230.0",
    description: "Auto-hides the Lovable 'Payment issue detected.' sticky banner with a smooth CSS3 fade.",
    world: "MAIN",
    isGlobal: true,
    dependencies: [],
    loadOrder: 2,
    seed: {
        id: "default-payment-banner-hider",
        seedOnInstall: true,
        isRemovable: true,
        autoInject: true,
        runAt: "document_idle",
        cookieBinding: undefined,
        targetUrls: [
            { pattern: "https://lovable.dev/*", matchType: "glob" },
        ],
        cookies: [],
        settings: {},
    },
    assets: {
        css: [
            { file: "payment-banner-hider.css", inject: "head" },
        ],
        configs: [],
        scripts: [
            {
                file: "payment-banner-hider.js",
                order: 1,
                isIife: true,
            },
        ],
        templates: [],
        prompts: [],
    },
};

export default instruction;
