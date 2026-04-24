import { MembershipRoleApiCode } from "./membership-role-api-code";
import type { MembershipSummary, WorkspaceSummary } from "./lovable-api-types";

/**
 * Wire→Domain mappers. Lovable's REST returns lowercase keys; our domain
 * uses PascalCase to match SQLite. Mapping is explicit (no `as` casts).
 */

const ROLE_BY_WIRE: Readonly<Record<string, MembershipRoleApiCode>> = Object.freeze({
    owner: MembershipRoleApiCode.Owner,
    admin: MembershipRoleApiCode.Admin,
    member: MembershipRoleApiCode.Member,
});

const readString = (source: object, key: string): string => {
    const record: Record<string, unknown> = source as Record<string, unknown>;
    const value = record[key];

    if (typeof value !== "string") {
        throw new Error(`Lovable wire response missing string field: ${key}`);
    }

    return value;
};

const readRole = (source: object): MembershipRoleApiCode => {
    const raw = readString(source, "role");
    const role = ROLE_BY_WIRE[raw];

    if (role === undefined) {
        throw new Error(`Lovable wire response has unknown role: ${raw}`);
    }

    return role;
};

export const mapWorkspace = (wire: object): WorkspaceSummary => ({
    Id: readString(wire, "id"),
    Name: readString(wire, "name"),
});

export const mapMembership = (wire: object): MembershipSummary => ({
    UserId: readString(wire, "user_id"),
    Email: readString(wire, "email"),
    Role: readRole(wire),
});

export const mapArray = <T>(wire: object, mapItem: (item: object) => T): T[] => {
    if (!Array.isArray(wire)) {
        throw new Error("Lovable wire response expected an array");
    }

    return wire.map(mapItem);
};
