import type { Identifier } from "../primitives/identifier";
import type { VersionString } from "../primitives/version-string";

/**
 * One entry in `ProjectInstruction.Dependencies`. Replaces the legacy
 * inline `Array<string>` (project-id only) and the older
 * `Array<{ projectId; version }>` shape.
 *
 * All keys PascalCase per `mem://standards/pascalcase-json-keys`.
 */
export type ProjectDependency = {
    readonly ProjectId: Identifier;
    readonly Version: VersionString;
};
