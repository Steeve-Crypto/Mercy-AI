#!/usr/bin/env node
/**
 * Legacy authorization-claim backfill for hosted Supabase users.
 *
 * Source of truth: mercy_tenant_members + mercy_tenants (never user_metadata).
 * Dry-run by default. Use --apply to write app_metadata.
 *
 * Usage:
 *   node scripts/backfill-auth-claims.mjs
 *   node scripts/backfill-auth-claims.mjs --apply
 *   node scripts/backfill-auth-claims.mjs --apply --user-id=<uuid>
 *   node scripts/backfill-auth-claims.mjs --json
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(webRoot, ".env.local"));
loadEnvFile(resolve(webRoot, ".env"));

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function parseArgs(argv) {
  const args = {
    apply: false,
    json: false,
    userId: null,
    pageSize: 200,
    maxUsers: 5000,
  };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg === "--json") args.json = true;
    else if (arg.startsWith("--user-id=")) args.userId = arg.slice("--user-id=".length).trim() || null;
    else if (arg.startsWith("--page-size=")) args.pageSize = Math.max(1, Number(arg.slice("--page-size=".length)) || 200);
    else if (arg.startsWith("--max-users=")) args.maxUsers = Math.max(1, Number(arg.slice("--max-users=".length)) || 5000);
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

function normalizeDbSubscriptionStatus(status) {
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

function workspaceActiveForStatus(status) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

function buildCanonicalAppMetadata({
  tenantId,
  firmId,
  accountType,
  roles,
  seats,
  subscriptionStatus,
  customerId,
  subscriptionId,
}) {
  const normalizedStatus = normalizeDbSubscriptionStatus(subscriptionStatus);
  const workspaceActive = workspaceActiveForStatus(normalizedStatus);
  return {
    tenant_id: tenantId,
    firm_id: firmId,
    account_type: accountType,
    roles: [...roles],
    attorney_seat_limit: seats,
    subscription_status: normalizedStatus,
    account_status: normalizedStatus,
    workspace_active: workspaceActive,
    account_active: workspaceActive,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
  };
}

function mergeCanonicalAppMetadata(current, next) {
  const merged = { ...(current || {}), ...next };
  for (const key of ["tenantId", "firmId", "accountType", "stripeCustomerId", "role"]) {
    delete merged[key];
  }
  if ("roles" in next) delete merged.role;
  return merged;
}

function stringClaim(metadata, ...keys) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function rolesClaim(metadata) {
  const raw = metadata?.roles !== undefined ? metadata.roles : metadata?.role;
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((role) => String(role).trim().toLowerCase()).filter(Boolean))];
  }
  if (typeof raw === "string") {
    return [...new Set(raw.split(",").map((role) => role.trim().toLowerCase()).filter(Boolean))];
  }
  return [];
}

function authorizationSnapshot(metadata) {
  const app = metadata && typeof metadata === "object" ? metadata : {};
  const activeValues = [app.workspace_active, app.account_active, app.active].filter(
    (value) => value !== undefined && value !== null,
  );
  let workspaceActive = null;
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
    roles: rolesClaim(app).sort(),
    stripeCustomerId: stringClaim(app, "stripe_customer_id", "stripeCustomerId"),
  };
}

function snapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function legacyUserMetadataAuthorizationPresent(userMetadata) {
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

function decideBackfill({ appMetadata, userMetadata, membership }) {
  const current = authorizationSnapshot(appMetadata);
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
    const desired = buildCanonicalAppMetadata(membership);
    const desiredSnapshot = authorizationSnapshot(desired);
    if (snapshotsEqual(current, desiredSnapshot)) {
      return { action: "skip", reason: "app_metadata_already_canonical" };
    }
    if (current.tenantId || current.roles.length > 0) {
      return { action: "repair", reason: "app_metadata_diverges_from_membership", appMetadata: desired };
    }
    return { action: "backfill", reason: "membership_verified_backfill", appMetadata: desired };
  }
  if (legacyUserMetadataAuthorizationPresent(userMetadata)) {
    return { action: "manual_review", reason: "user_metadata_authorization_without_membership_row" };
  }
  if (!current.tenantId && current.roles.length === 0) {
    return { action: "skip", reason: "no_authorization_claims_and_no_membership" };
  }
  return { action: "manual_review", reason: "incomplete_app_metadata_without_membership" };
}

async function listAllUsers(supabase, { pageSize, maxUsers, userId }) {
  if (userId) {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw new Error(error.message);
    return data.user ? [data.user] : [];
  }
  const users = [];
  let page = 1;
  while (users.length < maxUsers) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw new Error(error.message);
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < pageSize) break;
    page += 1;
  }
  return users.slice(0, maxUsers);
}

async function loadMembershipIndex(supabase) {
  const { data: members, error: memberError } = await supabase
    .from("mercy_tenant_members")
    .select("user_id,tenant_id,firm_id,roles,status,email");
  if (memberError) throw new Error(`mercy_tenant_members: ${memberError.message}`);

  const tenantIds = [...new Set((members || []).map((row) => row.tenant_id).filter(Boolean))];
  let tenantsById = new Map();
  if (tenantIds.length) {
    const { data: tenants, error: tenantError } = await supabase
      .from("mercy_tenants")
      .select("tenant_id,firm_id,account_type,attorney_seat_limit,subscription_status,stripe_customer_id,stripe_subscription_id")
      .in("tenant_id", tenantIds);
    if (tenantError) throw new Error(`mercy_tenants: ${tenantError.message}`);
    tenantsById = new Map((tenants || []).map((row) => [row.tenant_id, row]));
  }

  const byUserId = new Map();
  for (const member of members || []) {
    if (typeof member.user_id !== "string" || !member.user_id.trim()) continue;
    const tenant = tenantsById.get(member.tenant_id);
    if (!tenant) continue;
    const accountType = tenant.account_type === "firm" ? "firm" : "solo";
    const roles =
      Array.isArray(member.roles) && member.roles.length
        ? member.roles.map(String).filter(Boolean)
        : accountType === "firm"
          ? ["admin", "firm_admin", "attorney"]
          : ["admin", "attorney"];
    byUserId.set(member.user_id.trim(), {
      tenantId: member.tenant_id,
      firmId: accountType === "firm" ? member.firm_id || tenant.firm_id || null : null,
      accountType,
      roles,
      seats: Number(tenant.attorney_seat_limit || (accountType === "firm" ? 2 : 1)),
      subscriptionStatus: normalizeDbSubscriptionStatus(String(tenant.subscription_status || "pending")),
      customerId: tenant.stripe_customer_id || null,
      subscriptionId: tenant.stripe_subscription_id || null,
      memberStatus: String(member.status || "pending"),
    });
  }
  return byUserId;
}

function printHelp() {
  console.log(`Mercy authorization claim backfill

Dry-run scans Supabase users and membership rows, then reports backfill/repair/manual-review actions.
Never copies user_metadata authorization fields into app_metadata.

Options:
  --apply              Write canonical app_metadata for backfill/repair actions
  --user-id=<uuid>     Limit to one user
  --json               Machine-readable summary
  --page-size=<n>      Auth admin list page size (default 200)
  --max-users=<n>      Safety cap (default 5000)

Env:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    console.error("Set them in the environment or mercy-legal-web/.env.local before running hosted backfill.");
    process.exit(2);
  }

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const membershipByUser = await loadMembershipIndex(supabase);
  const users = await listAllUsers(supabase, args);

  const results = [];
  let applied = 0;
  let applyErrors = 0;

  for (const user of users) {
    const membership = membershipByUser.get(user.id) || null;
    const decision = decideBackfill({
      appMetadata: user.app_metadata || {},
      userMetadata: user.user_metadata || {},
      membership,
    });
    const row = {
      userId: user.id,
      email: user.email || null,
      action: decision.action,
      reason: decision.reason,
      applied: false,
      error: null,
    };

    if (args.apply && (decision.action === "backfill" || decision.action === "repair") && decision.appMetadata) {
      const nextMetadata = mergeCanonicalAppMetadata(user.app_metadata || {}, decision.appMetadata);
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: nextMetadata,
      });
      if (error) {
        row.error = error.message;
        applyErrors += 1;
      } else {
        row.applied = true;
        applied += 1;
      }
    }
    results.push(row);
  }

  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    scannedUsers: users.length,
    membershipRows: membershipByUser.size,
    counts: {
      skip: results.filter((r) => r.action === "skip").length,
      backfill: results.filter((r) => r.action === "backfill").length,
      repair: results.filter((r) => r.action === "repair").length,
      manual_review: results.filter((r) => r.action === "manual_review").length,
      applied,
      applyErrors,
    },
    results: results.filter((r) => r.action !== "skip" || r.error),
    postApplyOperatorSteps: [
      "Users with applied claim changes must refreshSession() or sign out/in so Core receives a JWT with the new app_metadata.",
      "The Next.js session helper auto-refreshes stale access tokens when getUser() app_metadata diverges from the JWT.",
      "Resolve every manual_review row through /admin/provisioning or scripts/provision_microsoft_identity.py before beta invite.",
    ],
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Mode: ${summary.mode}`);
    console.log(`Scanned users: ${summary.scannedUsers}`);
    console.log(`Membership index: ${summary.membershipRows}`);
    console.log(
      `Actions: skip=${summary.counts.skip} backfill=${summary.counts.backfill} repair=${summary.counts.repair} manual_review=${summary.counts.manual_review}`,
    );
    if (args.apply) {
      console.log(`Applied: ${summary.counts.applied}; errors: ${summary.counts.applyErrors}`);
    }
    for (const row of summary.results) {
      console.log(
        `- ${row.action} ${row.userId}${row.email ? ` <${row.email}>` : ""} :: ${row.reason}${row.applied ? " [applied]" : ""}${row.error ? ` ERROR=${row.error}` : ""}`,
      );
    }
    console.log("\nPost-apply operator steps:");
    for (const step of summary.postApplyOperatorSteps) {
      console.log(`  - ${step}`);
    }
  }

  if (applyErrors > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
