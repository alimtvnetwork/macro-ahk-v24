import type { Identifier } from "../primitives/identifier";
import type { VersionString } from "../primitives/version-string";

/**
 * One entry in `ProjectInstruction.dependencies`. Replaces the legacy
 * inline `Array<{ projectId: string; version: string }>` shape.
 */
export type ProjectDependency = {
    readonly projectId: Identifier;
    readonly version: VersionString;
};
