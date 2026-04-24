/**
 * Owner Switch — promote orchestrator.
 *
 * Three-step chain (ResolveWorkspace → ResolveUserId → PromoteToOwner).
 * Calls `LovableApiClient.promoteToOwner(...)` — the SAME method User
 * Add Step B will reuse (R12 invariant: only one PUT call site across
 * `standalone-scripts/lovable-*`).
 */

import { LovableApiClient } from "../../../lovable-common/src/api/lovable-api-client";
import { resolveUserId, resolveWorkspaceId } from "./promote-resolvers";
import { TtlCache } from "./ttl-cache";
import { PromoteStepCode } from "./promote-types";
import type { PromoteRowOutcome, PromoteRowRequest, PromoteRowResult } from "./promote-types";

export interface PromoteCaches {
    WorkspaceByLoginEmail: TtlCache<string>;
    UserIdByEmail: TtlCache<string>;
}

const measure = async <T>(
    step: PromoteStepCode,
    run: () => Promise<T>,
): Promise<{ Outcome: PromoteRowOutcome; Value: T }> => {
    const startedAt = Date.now();
    const value = await run();

    return {
        Outcome: { Step: step, DurationMs: Date.now() - startedAt, WorkspaceId: null, UserId: null },
        Value: value,
    };
};

interface ChainState {
    Outcomes: PromoteRowOutcome[];
    WorkspaceId: string;
    UserId: string;
}

const runChain = async (
    api: LovableApiClient,
    caches: PromoteCaches,
    request: PromoteRowRequest,
): Promise<ChainState> => {
    const ws = await measure(PromoteStepCode.ResolveWorkspace, () =>
        resolveWorkspaceId(api, caches.WorkspaceByLoginEmail, request.LoginEmail));
    const uid = await measure(PromoteStepCode.ResolveUserId, () =>
        resolveUserId(api, caches.UserIdByEmail, ws.Value, request.OwnerEmail));
    const promo = await measure(PromoteStepCode.PromoteToOwner, () =>
        api.promoteToOwner(ws.Value, uid.Value));

    return {
        Outcomes: [
            { ...ws.Outcome, WorkspaceId: ws.Value },
            { ...uid.Outcome, WorkspaceId: ws.Value, UserId: uid.Value },
            { ...promo.Outcome, WorkspaceId: ws.Value, UserId: uid.Value },
        ],
        WorkspaceId: ws.Value,
        UserId: uid.Value,
    };
};

const failureFrom = (caught: unknown, lastStep: PromoteStepCode | null): PromoteRowResult => ({
    Outcomes: [],
    FailedStep: lastStep,
    Error: caught instanceof Error ? caught.message : String(caught),
});

export const runPromote = async (
    api: LovableApiClient,
    caches: PromoteCaches,
    request: PromoteRowRequest,
): Promise<PromoteRowResult> => {
    try {
        const chain = await runChain(api, caches, request);

        return { Outcomes: chain.Outcomes, FailedStep: null, Error: null };
    } catch (caught: unknown) {
        return failureFrom(caught, null);
    }
};
