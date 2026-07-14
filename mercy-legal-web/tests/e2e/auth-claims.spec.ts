import { expect, test } from "@playwright/test";
import {
  accessTokenAuthorizationIsStale,
  buildCanonicalAppMetadata,
  decideLegacyClaimBackfill,
  mergeCanonicalAppMetadata,
  normalizeDbSubscriptionStatus,
  subscriptionGrantsWorkspaceAccess,
} from "../../src/lib/auth/authorization-claims";
import {
  hasTrustedPlatformAdminAccess,
  hasTrustedWorkspaceAccess,
  trustedAccountClaims,
} from "../../src/lib/auth/trusted-claims";
import { safeInternalNextPath } from "../../src/lib/auth/safe-next";

test("user metadata cannot supply tenant, entitlement, or platform roles", () => {
  const user = {
    app_metadata: {},
    user_metadata: {
      tenant_id: "victim-tenant",
      firm_id: "victim-firm",
      roles: ["superadmin"],
      account_status: "active",
      workspace_active: true,
    },
  };

  expect(trustedAccountClaims(user)).toEqual({
    tenantId: null,
    firmId: null,
    accountType: null,
    accountStatus: null,
    workspaceActive: false,
    roles: [],
    stripeCustomerId: null,
  });
  expect(hasTrustedWorkspaceAccess(user)).toBe(false);
  expect(hasTrustedPlatformAdminAccess(user)).toBe(false);
});

test("trusted app metadata wins over conflicting display metadata", () => {
  const user = {
      app_metadata: {
        tenant_id: "tenant-a",
        firm_id: "firm-a",
      account_type: "firm",
      roles: ["Attorney", "unknown-role"],
      account_status: "active",
      workspace_active: true,
    },
    user_metadata: {
      tenant_id: "tenant-b",
      firm_id: "firm-b",
      roles: ["superadmin"],
      account_status: "active",
    },
  };

  expect(trustedAccountClaims(user)).toMatchObject({
    tenantId: "tenant-a",
    firmId: "firm-a",
    roles: ["attorney"],
  });
  expect(hasTrustedWorkspaceAccess(user)).toBe(true);
  expect(hasTrustedPlatformAdminAccess(user)).toBe(false);
});

test("blocked, malformed, and incomplete trusted claims fail closed", () => {
  for (const accountStatus of ["pending", "past_due", "suspended", "canceled"]) {
    expect(
      hasTrustedWorkspaceAccess({
        app_metadata: {
          tenant_id: "tenant-a",
          account_type: "solo",
          roles: ["attorney"],
          account_status: accountStatus,
          workspace_active: true,
        },
      }),
    ).toBe(false);
  }

  expect(
    hasTrustedWorkspaceAccess({
      app_metadata: {
        tenant_id: "tenant-a",
        account_type: "solo",
        roles: ["attorney"],
        account_status: "active",
        workspace_active: "invalid",
      },
    }),
  ).toBe(false);
  expect(
    hasTrustedWorkspaceAccess({
      app_metadata: { tenant_id: "tenant-a", account_type: "firm", roles: ["attorney"], account_status: "active", workspace_active: true },
    }),
  ).toBe(false);
  expect(
    hasTrustedWorkspaceAccess({
      app_metadata: { tenant_id: "tenant-a", firm_id: "firm-a", account_type: "solo", roles: ["attorney"], account_status: "active", workspace_active: true },
    }),
  ).toBe(false);
  expect(
    hasTrustedWorkspaceAccess({
      app_metadata: { tenant_id: "tenant-a", account_type: "solo", account_status: "active", workspace_active: true },
    }),
  ).toBe(false);
});

test("trusted trialing and platform administration claims remain supported", () => {
  expect(
    hasTrustedWorkspaceAccess({
      app_metadata: { tenant_id: "tenant-a", account_type: "solo", roles: "attorney", subscription_status: "trialing", workspace_active: true },
    }),
  ).toBe(true);
  expect(
    hasTrustedPlatformAdminAccess({
      app_metadata: { tenant_id: "platform", account_type: "solo", roles: ["superadmin"], account_status: "active", workspace_active: true },
    }),
  ).toBe(true);
});

test("ordinary admins, deactivated platform roles, and conflicting aliases fail closed", () => {
  expect(
    hasTrustedPlatformAdminAccess({
      app_metadata: { tenant_id: "tenant-a", account_type: "solo", roles: ["admin"], account_status: "active", workspace_active: true },
    }),
  ).toBe(false);
  expect(
    hasTrustedPlatformAdminAccess({
      app_metadata: { tenant_id: "platform", account_type: "solo", roles: ["superadmin"], account_status: "suspended", workspace_active: false },
    }),
  ).toBe(false);
  expect(
    hasTrustedWorkspaceAccess({
      app_metadata: {
        tenant_id: "tenant-a",
        account_type: "solo",
        roles: ["attorney"],
        role: "superadmin",
        subscription_status: "active",
        account_status: "suspended",
        workspace_active: true,
      },
    }),
  ).toBe(false);
});

test("Stripe customer identity is accepted only from server-owned metadata", () => {
  expect(
    trustedAccountClaims({
      app_metadata: { stripe_customer_id: "cus_trusted" },
      user_metadata: { stripe_customer_id: "cus_attacker" },
    }).stripeCustomerId,
  ).toBe("cus_trusted");
  expect(
    trustedAccountClaims({ app_metadata: {}, user_metadata: { stripe_customer_id: "cus_attacker" } })
      .stripeCustomerId,
  ).toBeNull();
});

test("post-auth redirects accept only internal paths", () => {
  expect(safeInternalNextPath("/matters/abc?tab=vault")).toBe("/matters/abc?tab=vault");
  for (const unsafe of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil.example", "\n/dashboard"]) {
    expect(safeInternalNextPath(unsafe)).toBe("/dashboard");
  }
});

test("canonical entitlement mapping grants only active and trialing workspaces", () => {
  expect(subscriptionGrantsWorkspaceAccess("active")).toBe(true);
  expect(subscriptionGrantsWorkspaceAccess("trialing")).toBe(true);
  for (const status of ["past_due", "canceled", "suspended", "incomplete", "pending", "unpaid", "paused"]) {
    expect(subscriptionGrantsWorkspaceAccess(status)).toBe(false);
  }
  expect(normalizeDbSubscriptionStatus("unpaid")).toBe("past_due");
  expect(normalizeDbSubscriptionStatus("paused")).toBe("suspended");

  const canceled = buildCanonicalAppMetadata({
    tenantId: "tenant-a",
    firmId: null,
    accountType: "solo",
    roles: ["admin", "attorney"],
    seats: 1,
    subscriptionStatus: "canceled",
    customerId: "cus_1",
    subscriptionId: "sub_1",
  });
  expect(canceled.workspace_active).toBe(false);
  expect(canceled.account_status).toBe("canceled");
});

test("legacy claim backfill uses membership rows and never promotes user_metadata alone", () => {
  const membershipOnly = decideLegacyClaimBackfill({
    appMetadata: {},
    userMetadata: {
      tenant_id: "attacker-tenant",
      roles: ["superadmin"],
      account_status: "active",
      workspace_active: true,
    },
    membership: null,
  });
  expect(membershipOnly).toMatchObject({
    action: "manual_review",
    reason: "user_metadata_authorization_without_membership_row",
  });

  const backfill = decideLegacyClaimBackfill({
    appMetadata: {},
    userMetadata: {},
    membership: {
      userId: "user-1",
      tenantId: "tenant-a",
      firmId: null,
      accountType: "solo",
      roles: ["admin", "attorney"],
      memberStatus: "active",
      seats: 1,
      subscriptionStatus: "active",
      customerId: "cus_1",
      subscriptionId: "sub_1",
    },
  });
  expect(backfill.action).toBe("backfill");
  if (backfill.action === "backfill") {
    expect(backfill.appMetadata).toMatchObject({
      tenant_id: "tenant-a",
      account_type: "solo",
      workspace_active: true,
      stripe_customer_id: "cus_1",
    });
  }

  const alreadyCanonical = decideLegacyClaimBackfill({
    appMetadata: buildCanonicalAppMetadata({
      tenantId: "tenant-a",
      firmId: null,
      accountType: "solo",
      roles: ["admin", "attorney"],
      seats: 1,
      subscriptionStatus: "active",
      customerId: "cus_1",
      subscriptionId: "sub_1",
    }),
    membership: {
      userId: "user-1",
      tenantId: "tenant-a",
      firmId: null,
      accountType: "solo",
      roles: ["admin", "attorney"],
      memberStatus: "active",
      seats: 1,
      subscriptionStatus: "active",
      customerId: "cus_1",
      subscriptionId: "sub_1",
    },
  });
  expect(alreadyCanonical).toMatchObject({ action: "skip", reason: "app_metadata_already_canonical" });
});

test("canonical metadata merge strips conflicting authorization aliases", () => {
  const merged = mergeCanonicalAppMetadata(
    {
      tenantId: "stale-tenant",
      firmId: "stale-firm",
      role: "superadmin",
      provider: "email",
    },
    buildCanonicalAppMetadata({
      tenantId: "tenant-a",
      firmId: null,
      accountType: "solo",
      roles: ["attorney"],
      seats: 1,
      subscriptionStatus: "active",
      customerId: null,
      subscriptionId: null,
    }),
  );
  expect(merged.tenant_id).toBe("tenant-a");
  expect(merged.tenantId).toBeUndefined();
  expect(merged.firmId).toBeUndefined();
  expect(merged.role).toBeUndefined();
  expect(merged.provider).toBe("email");
});

test("stale access-token claims are detected against verified app_metadata", () => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const stalePayload = Buffer.from(
    JSON.stringify({
      sub: "user-1",
      app_metadata: {
        tenant_id: "old-tenant",
        account_type: "solo",
        roles: ["attorney"],
        subscription_status: "active",
        workspace_active: true,
      },
    }),
  ).toString("base64url");
  const staleToken = `${header}.${stalePayload}.sig`;
  const currentAppMetadata = buildCanonicalAppMetadata({
    tenantId: "tenant-a",
    firmId: null,
    accountType: "solo",
    roles: ["attorney"],
    seats: 1,
    subscriptionStatus: "active",
    customerId: null,
    subscriptionId: null,
  });
  expect(accessTokenAuthorizationIsStale(staleToken, currentAppMetadata)).toBe(true);

  const freshPayload = Buffer.from(
    JSON.stringify({
      sub: "user-1",
      app_metadata: currentAppMetadata,
    }),
  ).toString("base64url");
  const freshToken = `${header}.${freshPayload}.sig`;
  expect(accessTokenAuthorizationIsStale(freshToken, currentAppMetadata)).toBe(false);
});
