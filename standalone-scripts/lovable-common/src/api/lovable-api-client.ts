import { LovableApiEndpoint } from "./lovable-api-endpoint";
import { MembershipRoleApiCode } from "./membership-role-api-code";
import type {
    AddMembershipRequest,
    MembershipSummary,
    UpdateMembershipRoleRequest,
    WorkspaceSummary,
} from "./lovable-api-types";

/**
 * BearerTokenProvider — injected dependency. P3 will wire this to the
 * unified `getBearerToken()` contract (mem://auth/unified-auth-contract).
 */
export type BearerTokenProvider = () => Promise<string>;

const NOT_IMPLEMENTED = "LovableApiClient: network call wired in P3";

/**
 * LovableApiClient — single source of truth for Lovable membership REST
 * calls. Consumed by both `lovable-owner-switch` (promoteToOwner) and
 * `lovable-user-add` (addMembership + promoteToOwner).
 *
 * Phase: P2 — typed contracts only; every method throws `NOT_IMPLEMENTED`.
 * Phase P3 wires real `fetch` + bearer-token resolution + namespace logger.
 */
export class LovableApiClient {
    private readonly endpoint: LovableApiEndpoint;
    private readonly tokenProvider: BearerTokenProvider;

    public constructor(tokenProvider: BearerTokenProvider, apiBase?: string) {
        this.endpoint = new LovableApiEndpoint(apiBase);
        this.tokenProvider = tokenProvider;
    }

    public async getWorkspaces(): Promise<WorkspaceSummary[]> {
        await this.tokenProvider();
        throw new Error(`${NOT_IMPLEMENTED} (${this.endpoint.workspaces()})`);
    }

    public async getMemberships(workspaceId: string): Promise<MembershipSummary[]> {
        await this.tokenProvider();
        throw new Error(`${NOT_IMPLEMENTED} (${this.endpoint.memberships(workspaceId)})`);
    }

    public async addMembership(workspaceId: string, body: AddMembershipRequest): Promise<MembershipSummary> {
        await this.tokenProvider();
        throw new Error(`${NOT_IMPLEMENTED} (POST ${this.endpoint.memberships(workspaceId)} ${body.Email})`);
    }

    public async updateMembershipRole(workspaceId: string, userId: string, body: UpdateMembershipRoleRequest): Promise<MembershipSummary> {
        await this.tokenProvider();
        throw new Error(`${NOT_IMPLEMENTED} (PUT ${this.endpoint.membership(workspaceId, userId)} ${body.Role})`);
    }

    public async promoteToOwner(workspaceId: string, userId: string): Promise<MembershipSummary> {
        return this.updateMembershipRole(workspaceId, userId, { Role: MembershipRoleApiCode.Owner });
    }
}
