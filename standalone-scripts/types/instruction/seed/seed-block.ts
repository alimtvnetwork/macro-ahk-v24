import { InjectionRunAt } from "../enums/injection-run-at";
import type { Identifier } from "../primitives/identifier";
import type { CookieBinding } from "./cookie-binding";
import type { CookieSpec } from "./cookie-spec";
import type { TargetUrl } from "./target-url";

/**
 * Declarative seed metadata that controls how the runtime registers,
 * persists, and re-injects a standalone script.
 *
 * `TSettings` carries the project-specific settings shape; default to
 * `EmptySettings` when there are none. Settings live in their own
 * project type file — never inlined here.
 */
export type SeedBlock<TSettings extends object> = {
    readonly id: Identifier;
    readonly seedOnInstall: boolean;
    readonly isRemovable: boolean;
    readonly autoInject: boolean;
    readonly runAt: InjectionRunAt;
    readonly cookieBinding?: CookieBinding;
    readonly targetUrls: ReadonlyArray<TargetUrl>;
    readonly cookies: ReadonlyArray<CookieSpec>;
    readonly settings: TSettings;
};
