type AuthMetadata = Record<string, unknown>;

export type TrustedAuthUser = {
  app_metadata?: AuthMetadata | null;
  user_metadata?: AuthMetadata | null;
};

export type TrustedAccountClaims = {
  tenantId: string | null;
  firmId: string | null;
  accountType: string | null;
  accountStatus: string | null;
  workspaceActive: boolean;
  roles: string[];
  stripeCustomerId: string | null;
};

const PLATFORM_BYPASS_ROLES = new Set(["superadmin", "platform_admin", "ops"]);
const ACTIVE_ACCOUNT_STATUSES = new Set(["active", "trialing"]);
const ACCOUNT_TYPES = new Set(["solo", "firm"]);
const MERCY_ROLES = new Set([
  "attorney",
  "paralegal",
  "owner",
  "admin",
  "firm_admin",
  "superadmin",
  "platform_admin",
  "ops",
]);

function stringFromMetadata(metadata: AuthMetadata, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizedStringFromMetadata(metadata: AuthMetadata, ...keys: string[]): string | null {
  const value = stringFromMetadata(metadata, ...keys);
  return value ? value.toLowerCase() : null;
}

function stringAliasesAgree(metadata: AuthMetadata, keys: string[], normalize = false): boolean {
  const values = keys
    .map((key) => metadata[key])
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => (normalize ? value.trim().toLowerCase() : value.trim()));
  return new Set(values).size <= 1;
}

function authorizationAliasesAgree(metadata: AuthMetadata): boolean {
  return (
    stringAliasesAgree(metadata, ["tenant_id", "tenantId"]) &&
    stringAliasesAgree(metadata, ["firm_id", "firmId"]) &&
    stringAliasesAgree(metadata, ["account_type", "accountType"], true) &&
    stringAliasesAgree(metadata, ["subscription_status", "account_status"], true) &&
    stringAliasesAgree(metadata, ["stripe_customer_id", "stripeCustomerId"])
  );
}

function normalizedRoles(rawRoles: unknown): string[] {
  const roles = Array.isArray(rawRoles)
    ? rawRoles.map((role) => String(role).trim().toLowerCase()).filter(Boolean)
    : typeof rawRoles === "string"
      ? rawRoles.split(",").map((role) => role.trim().toLowerCase()).filter(Boolean)
      : [];
  return [...new Set(roles.filter((role) => MERCY_ROLES.has(role)))];
}

function rolesFromAppMetadata(metadata: AuthMetadata): string[] {
  const primaryRoles = normalizedRoles(metadata.roles);
  const legacyRoles = normalizedRoles(metadata.role);
  if (metadata.roles !== undefined && metadata.role !== undefined) {
    const primaryKey = [...primaryRoles].sort().join(",");
    const legacyKey = [...legacyRoles].sort().join(",");
    if (primaryKey !== legacyKey) return [];
  }
  return metadata.roles !== undefined ? primaryRoles : legacyRoles;
}

function workspaceActiveFromAppMetadata(metadata: AuthMetadata): boolean {
  const values = [metadata.workspace_active, metadata.account_active, metadata.active].filter(
    (value) => value !== undefined && value !== null,
  );
  if (values.length === 0) return false;
  for (const value of values) {
    if (value === true) continue;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "enabled", "active"].includes(normalized)) continue;
    }
    return false;
  }
  return true;
}

/**
 * Extract authorization claims only from Supabase app_metadata.
 * user_metadata is deliberately excluded because authenticated users can edit it.
 */
export function trustedAccountClaims(user: TrustedAuthUser): TrustedAccountClaims {
  const appMetadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return {
    tenantId: stringFromMetadata(appMetadata, "tenant_id", "tenantId"),
    firmId: stringFromMetadata(appMetadata, "firm_id", "firmId"),
    accountType: normalizedStringFromMetadata(appMetadata, "account_type", "accountType"),
    accountStatus: normalizedStringFromMetadata(appMetadata, "subscription_status", "account_status"),
    workspaceActive: workspaceActiveFromAppMetadata(appMetadata),
    roles: rolesFromAppMetadata(appMetadata),
    stripeCustomerId: stringFromMetadata(appMetadata, "stripe_customer_id", "stripeCustomerId"),
  };
}

export function hasTrustedWorkspaceAccess(user: TrustedAuthUser): boolean {
  const appMetadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  if (!authorizationAliasesAgree(appMetadata)) return false;
  const claims = trustedAccountClaims(user);
  const hasDataScope = Boolean(claims.tenantId || claims.firmId);
  if (!hasDataScope || claims.roles.length === 0) return false;
  if (!claims.accountType || !ACCOUNT_TYPES.has(claims.accountType)) return false;
  if (claims.accountType === "firm" && !claims.firmId) return false;
  if (claims.accountType === "solo" && claims.firmId) return false;
  if (!claims.workspaceActive) return false;
  return Boolean(claims.accountStatus && ACTIVE_ACCOUNT_STATUSES.has(claims.accountStatus));
}

export function hasTrustedPlatformAdminAccess(user: TrustedAuthUser): boolean {
  const appMetadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  if (!authorizationAliasesAgree(appMetadata)) return false;
  const claims = trustedAccountClaims(user);
  const hasDataScope = Boolean(claims.tenantId || claims.firmId);
  const hasPlatformRole = claims.roles.some((role) => PLATFORM_BYPASS_ROLES.has(role));
  const accountTypeAllowed = Boolean(claims.accountType && ACCOUNT_TYPES.has(claims.accountType));
  const accountStatusAllowed = Boolean(claims.accountStatus && ACTIVE_ACCOUNT_STATUSES.has(claims.accountStatus));
  const accountShapeAllowed =
    (claims.accountType === "firm" && Boolean(claims.firmId)) ||
    (claims.accountType === "solo" && !claims.firmId);
  return hasDataScope && hasPlatformRole && claims.workspaceActive && accountTypeAllowed && accountStatusAllowed && accountShapeAllowed;
}
