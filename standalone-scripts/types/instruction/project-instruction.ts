import { InjectionWorld } from "./enums/injection-world";
import type { Identifier } from "./primitives/identifier";
import type { VersionString } from "./primitives/version-string";
import type { AssetBundle } from "./assets/asset-bundle";
import type { ProjectDependency } from "./dependency/project-dependency";
import type { SeedBlock } from "./seed/seed-block";
import type { XPathRegistry } from "./xpath/xpath-registry";

/**
 * Top-level instruction manifest for one standalone script.
 *
 * Replaces every per-project `ProjectInstruction` interface (which
 * historically duplicated this shape and drifted across scripts).
 * `TSettings` flows through to `SeedBlock<TSettings>` so each script
 * can pin its own settings shape without losing structural reuse.
 *
 * Reviewer note: `xpaths` is optional in this draft — scripts that
 * touch the DOM with selectors should set it; scripts that only
 * inject CSS may omit it. Q2 in `00-readme.md` tracks the decision.
 */
export type ProjectInstruction<TSettings extends object> = {
    readonly schemaVersion: VersionString;
    readonly name: Identifier;
    readonly displayName: string;
    readonly version: VersionString;
    readonly description: string;
    readonly injectionWorld: InjectionWorld;
    readonly isGlobal?: boolean;
    readonly dependencies: ReadonlyArray<ProjectDependency>;
    readonly loadOrder: number;
    readonly seed: SeedBlock<TSettings>;
    readonly assets: AssetBundle;
    readonly xpaths?: XPathRegistry;
};
