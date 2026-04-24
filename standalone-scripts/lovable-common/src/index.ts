/**
 * Lovable Common — XPath + delay defaults + shared LovableApiClient.
 *
 * Consumed at runtime by lovable-owner-switch and lovable-user-add.
 */

export { XPathKeyCode } from "./xpath/xpath-key-code";
export { DefaultXPaths } from "./xpath/default-xpaths";
export { DefaultDelaysMs } from "./xpath/default-delays";
export type { XPathEntry } from "./xpath/xpath-entry";

export { LovableApiClient } from "./api/lovable-api-client";
export { LovableApiEndpoint } from "./api/lovable-api-endpoint";
export { LovableApiError } from "./api/lovable-api-error";
export { MembershipRoleApiCode } from "./api/membership-role-api-code";
export type {
    BearerTokenProvider,
} from "./api/lovable-api-client";
export type {
    AddMembershipRequest,
    MembershipSummary,
    UpdateMembershipRoleRequest,
    WorkspaceSummary,
} from "./api/lovable-api-types";

