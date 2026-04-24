import { MembershipRoleApiCode } from "./membership-role-api-code";
import type { MembershipSummary, WorkspaceSummary } from "./lovable-api-types";

/**
 * Wire→Domain mappers. Lovable's REST returns lowercase keys; our domain
 * uses PascalCase to match SQLite. Mapping is explicit (no `as` casts,
 * no `unknown`).
 *
 * `JSON.parse` returns `any` per stdlib types; we declare each accessor
 * with a precise return type so consumers never see `any` flow further.
 */

interface WireRecord {
    [key: string]: string;
}

const ROLE_BY_WIRE: Readonly<Record<string, MembershipRoleApiCode>> = Object.freeze({
    owner: MembershipRoleApiCode.Owner,
    admin: MembershipRoleApiCode.Admin,
    member: MembershipRoleApiCode.Member,
});

const readString = (source: WireRecord, key: string): string => {
    const value = source[key];

    if (typeof value !== "string") {
        throw new Error(`Lovable wire response missing string field: ${key}`);
    }

    return value;
};

const readRole = (source: WireRecord): MembershipRoleApiCode => {
    const raw = readString(source, "role");
    const role = ROLE_BY_WIRE[raw];

    if (role === undefined) {
        throw new Error(`Lovable wire response has unknown role: ${raw}`);
    }

    return role;
};

export const mapWorkspace = (wire: WireRecord): WorkspaceSummary => ({
    Id: readString(wire, "id"),
    Name: readString(wire, "name"),
});

export const mapMembership = (wire: WireRecord): MembershipSummary => ({
    UserId: readString(wire, "user_id"),
    Email: readString(wire, "email"),
    Role: readRole(wire),
});

export const mapWorkspaceArray = (wire: WireRecord[]): WorkspaceSummary[] => wire.map(mapWorkspace);

export const mapMembershipArray = (wire: WireRecord[]): MembershipSummary[] => wire.map(mapMembership);
