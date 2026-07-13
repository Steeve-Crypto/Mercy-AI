import { expect, test } from "@playwright/test";
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
