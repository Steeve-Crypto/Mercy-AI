/**
 * Canonical server-owned authorization claim helpers.
 *
 * Mercy derives production authorization only from Supabase app_metadata.
 * user_metadata is display-only and must never be promoted into authorization
 * claims without a verified membership/tenant row as the source of truth.
 */

export type SignupAccountType = "solo" | "firm";

export type CanonicalAppMetadataInput = {
  tenantId: string;
  firmId: string | null;
  accountType: SignupAccountType;
  roles: string[];
  seats: number;
  subscriptionStatus: string;
  customerId: string | null;
  subscriptionId: string | null;
};

export type MembershipBackfillSource = {
  userId: string;
  email?: string | null;
  tenantId: string;
  firmId?: string | null;
  accountType: SignupAccountType;
  roles: string[];
  memberStatus: string;
  seats: number;
  subscriptionStatus: string;
  customerId?: string | null;
  subscriptionId?: string | null;
};

export type ClaimBackfillDecision =
  | { action: "skip"; reason: string }
  | { action: "manual_review"; reason: string }
  | { action: "backfill"; reason: string; appMetadata: Record<string, unknown> }
  | { action: "repair"; reason: string; appMetadata: Record<string, unknown> };

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
export const DB_SUBSCRIPTION_STATUSES = new Set([
  "pending",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "suspended",
]);

const AUTHORIZATION_ALIAS_KEYS = [
  "tenantId",
  "firmId",
  "accountType",
  "stripeCustomerId",
  "role",
] as const;

export function normalizeDbSubscriptionStatus(status: string | null | undefined): string {
  if (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "canceled" ||
    status === "incomplete" ||
    status === "suspended"
  ) {
    return status;
  }
  if (status === "unpaid") return "past_due";
  if (status === "paused") return "suspended";
  if (status === "incomplete_expired") return "incomplete";
  return "pending";
}

export function workspaceActiveForStatus(status: string): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

export function subscriptionGrantsWorkspaceAccess(status: string | null | undefined): boolean {
  return workspaceActiveForStatus(normalizeDbSubscriptionStatus(status));
}

export function buildCanonicalAppMetadata(input: CanonicalAppMetadataInput): Record<string, unknown> {
  const subscriptionStatus = normalizeDbSubscriptionStatus(input.subscriptionStatus);
  const workspaceActive = workspaceActiveForStatus(subscriptionStatus);
  return {
    tenant_id: input.tenantId,
    firm_id: input.firmId,
    account_type: input.accountType,
    roles: [...input.roles],
    attorney_seat_limit: input.seats,
    subscription_status: subscriptionStatus,
    account_status: subscriptionStatus,
    workspace_active: workspaceActive,
    account_active: workspaceActive,
    stripe_customer_id: input.customerId,
    stripe_subscription_id: input.subscriptionId,
  };
}

/**
 * Merge server-owned authorization fields into app_metadata while removing
 * camelCase/legacy aliases that would fail closed as conflicting claims.
 */
export function mergeCanonicalAppMetadata(
  current: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(current || {}), ...next };
  for (const key of AUTHORIZATION_ALIAS_KEYS) {
    delete merged[key];
  }
  if ("roles" in next) {
    delete merged.role;
  }
  return merged;
}

export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json) as unknown;
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function stringClaim(metadata: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function rolesClaim(metadata: Record<string, unknown>): string[] {
  const raw = metadata.roles !== undefined ? metadata.roles : metadata.role;
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((role) => String(role).trim().toLowerCase()).filter(Boolean))];
  }
  if (typeof raw === "string") {
    return [...new Set(raw.split(",").map((role) => role.trim().toLowerCase()).filter(Boolean))];
  }
  return [];
}

export type AuthorizationSnapshot = {
  tenantId: string | null;
  firmId: string | null;
  accountType: string | null;
  accountStatus: string | null;
  workspaceActive: boolean | null;
  roles: string[];
  stripeCustomerId: string | null;
};

export function authorizationSnapshotFromMetadata(metadata: Record<string, unknown> | null | undefined): AuthorizationSnapshot {
  const app = metadata && typeof metadata === "object" ? metadata : {};
  const activeValues = [app.workspace_active, app.account_active, app.active].filter(
    (value) => value !== undefined && value !== null,
  );
  let workspaceActive: boolean | null = null;
  if (activeValues.length > 0) {
    workspaceActive = true;
    for (const value of activeValues) {
      if (value === true) continue;
      if (typeof value === "string" && ["true", "1", "yes", "enabled", "active"].includes(value.trim().toLowerCase())) {
        continue;
      }
      workspaceActive = false;
      break;
    }
  }
  return {
    tenantId: stringClaim(app, "tenant_id", "tenantId"),
    firmId: stringClaim(app, "firm_id", "firmId"),
    accountType: (stringClaim(app, "account_type", "accountType") || "").toLowerCase() || null,
    accountStatus: (stringClaim(app, "subscription_status", "account_status") || "").toLowerCase() || null,
    workspaceActive,
    roles: rolesClaim(app),
    stripeCustomerId: stringClaim(app, "stripe_customer_id", "stripeCustomerId"),
  };
}

export function authorizationSnapshotFromJwt(token: string | null | undefined): AuthorizationSnapshot {
  const payload = decodeJwtPayload(token);
  const appMetadata =
    payload && typeof payload.app_metadata === "object" && payload.app_metadata
      ? (payload.app_metadata as Record<string, unknown>)
      : {};
  return authorizationSnapshotFromMetadata(appMetadata);
}

export function authorizationSnapshotsEqual(a: AuthorizationSnapshot, b: AuthorizationSnapshot): boolean {
  const rolesA = [...a.roles].sort().join(",");
  const rolesB = [...b.roles].sort().join(",");
  return (
    a.tenantId === b.tenantId &&
    a.firmId === b.firmId &&
    a.accountType === b.accountType &&
    a.accountStatus === b.accountStatus &&
    a.workspaceActive === b.workspaceActive &&
    a.stripeCustomerId === b.stripeCustomerId &&
    rolesA === rolesB
  );
}

/**
 * True when the bearer JWT still carries authorization claims that no longer
 * match the verified Supabase user record (for example after entitlement sync
 * or claim backfill, before refreshSession reissues the token).
 */
export function accessTokenAuthorizationIsStale(
  accessToken: string | null | undefined,
  userAppMetadata: Record<string, unknown> | null | undefined,
): boolean {
  const userSnapshot = authorizationSnapshotFromMetadata(userAppMetadata);
  const tokenSnapshot = authorizationSnapshotFromJwt(accessToken);
  return !authorizationSnapshotsEqual(userSnapshot, tokenSnapshot);
}

export function legacyUserMetadataAuthorizationPresent(userMetadata: Record<string, unknown> | null | undefined): boolean {
  const meta = userMetadata && typeof userMetadata === "object" ? userMetadata : {};
  return Boolean(
    stringClaim(meta, "tenant_id", "tenantId") ||
      stringClaim(meta, "firm_id", "firmId") ||
      rolesClaim(meta).length > 0 ||
      stringClaim(meta, "account_status", "subscription_status") ||
      meta.workspace_active !== undefined ||
      meta.account_active !== undefined,
  );
}

export function decideLegacyClaimBackfill(input: {
  appMetadata?: Record<string, unknown> | null;
  userMetadata?: Record<string, unknown> | null;
  membership?: MembershipBackfillSource | null;
}): ClaimBackfillDecision {
  const app = input.appMetadata && typeof input.appMetadata === "object" ? input.appMetadata : {};
  const userMeta = input.userMetadata && typeof input.userMetadata === "object" ? input.userMetadata : {};
  const membership = input.membership || null;
  const current = authorizationSnapshotFromMetadata(app);

  if (membership) {
    if (membership.memberStatus !== "active") {
      return { action: "skip", reason: "membership_not_active" };
    }
    if (!membership.tenantId || membership.roles.length === 0) {
      return { action: "manual_review", reason: "membership_missing_tenant_or_roles" };
    }
    if (membership.accountType === "firm" && !membership.firmId) {
      return { action: "manual_review", reason: "firm_membership_missing_firm_id" };
    }
    if (membership.accountType === "solo" && membership.firmId) {
      return { action: "manual_review", reason: "solo_membership_has_firm_id" };
    }

    const desired = buildCanonicalAppMetadata({
      tenantId: membership.tenantId,
      firmId: membership.accountType === "firm" ? membership.firmId || null : null,
      accountType: membership.accountType,
      roles: membership.roles,
      seats: membership.seats,
      subscriptionStatus: membership.subscriptionStatus,
      customerId: membership.customerId || null,
      subscriptionId: membership.subscriptionId || null,
    });
    const desiredSnapshot = authorizationSnapshotFromMetadata(desired);
    if (authorizationSnapshotsEqual(current, desiredSnapshot)) {
      return { action: "skip", reason: "app_metadata_already_canonical" };
    }
    if (current.tenantId || current.roles.length > 0) {
      return { action: "repair", reason: "app_metadata_diverges_from_membership", appMetadata: desired };
    }
    return { action: "backfill", reason: "membership_verified_backfill", appMetadata: desired };
  }

  if (legacyUserMetadataAuthorizationPresent(userMeta)) {
    return {
      action: "manual_review",
      reason: "user_metadata_authorization_without_membership_row",
    };
  }

  if (!current.tenantId && current.roles.length === 0) {
    return { action: "skip", reason: "no_authorization_claims_and_no_membership" };
  }

  return { action: "manual_review", reason: "incomplete_app_metadata_without_membership" };
}

export function entitlementRevocationRequired(previousStatus: string | null | undefined, nextStatus: string): boolean {
  const previousAccess = subscriptionGrantsWorkspaceAccess(previousStatus);
  const nextAccess = subscriptionGrantsWorkspaceAccess(nextStatus);
  return previousAccess && !nextAccess;
}
