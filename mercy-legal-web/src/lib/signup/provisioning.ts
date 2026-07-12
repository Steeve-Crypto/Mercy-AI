import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export type SignupAccountType = "solo" | "firm";

export type PendingSignup = {
  accountType: SignupAccountType;
  userId: string;
  email: string;
  fullName: string;
  tenantName: string;
  firmName?: string;
  seats: number;
  practiceAreas: string;
  jurisdictionFocus: string;
};

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const DB_SUBSCRIPTION_STATUSES = new Set(["pending", "trialing", "active", "past_due", "canceled", "incomplete", "suspended"]);

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

function supabaseAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseAdmin() {
  if (!supabaseAdminConfigured()) {
    return null;
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function slugify(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function stableId(prefix: string, seed: string, sessionId: string) {
  const normalized = seed.replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 28) || prefix;
  const suffix = sessionId.replace(/[^a-zA-Z0-9]+/g, "").slice(-16) || "checkout";
  return `${prefix}_${normalized}_${suffix}`;
}

function dbSubscriptionStatus(status: string | null | undefined) {
  if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled" || status === "incomplete" || status === "suspended") {
    return status;
  }
  if (status === "unpaid") return "past_due";
  if (status === "paused") return "suspended";
  if (status === "incomplete_expired") return "incomplete";
  return "pending";
}

function checkoutSubscriptionStatus(session: Stripe.Checkout.Session) {
  const expandedSubscription =
    typeof session.subscription === "object" && session.subscription ? (session.subscription as Stripe.Subscription) : null;
  if (expandedSubscription?.status) {
    return dbSubscriptionStatus(expandedSubscription.status);
  }
  if (session.payment_status === "paid") return "active";
  if (session.payment_status === "no_payment_required") return "trialing";
  return "incomplete";
}

function workspaceActiveForStatus(status: string) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

function metadataBooleanActive(...values: unknown[]) {
  for (const value of values) {
    if (value === false) return false;
    if (typeof value === "string" && ["false", "0", "no", "disabled", "deactivated"].includes(value.trim().toLowerCase())) {
      return false;
    }
  }
  return true;
}

function canonicalAppMetadata({
  tenantId,
  firmId,
  accountType,
  roles,
  seats,
  subscriptionStatus,
  customerId,
  subscriptionId,
}: {
  tenantId: string;
  firmId: string | null;
  accountType: SignupAccountType;
  roles: string[];
  seats: number;
  subscriptionStatus: string;
  customerId: string | null;
  subscriptionId: string | null;
}) {
  const workspaceActive = workspaceActiveForStatus(subscriptionStatus);
  return {
    tenant_id: tenantId,
    firm_id: firmId,
    account_type: accountType,
    roles,
    attorney_seat_limit: seats,
    subscription_status: subscriptionStatus,
    account_status: subscriptionStatus,
    workspace_active: workspaceActive,
    account_active: workspaceActive,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
  };
}

async function updateUserAccountMetadata(
  supabase: SupabaseAdmin,
  userId: string,
  appMetadata: Record<string, unknown>,
  userMetadata?: Record<string, unknown>,
) {
  const { data, error: readError } = await supabase.auth.admin.getUserById(userId);
  if (readError) {
    return { error: readError.message };
  }
  const currentAppMetadata = (data.user?.app_metadata || {}) as Record<string, unknown>;
  const currentUserMetadata = (data.user?.user_metadata || {}) as Record<string, unknown>;
  const updatePayload: {
    app_metadata: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  } = {
    app_metadata: {
      ...currentAppMetadata,
      ...appMetadata,
    },
  };
  if (userMetadata) {
    updatePayload.user_metadata = {
      ...currentUserMetadata,
      ...userMetadata,
    };
  }
  const { error } = await supabase.auth.admin.updateUserById(userId, updatePayload);
  return { error: error?.message || null };
}

export function normalizeSignup(input: Partial<PendingSignup>): PendingSignup {
  const accountType = input.accountType === "firm" ? "firm" : "solo";
  const seats = accountType === "firm" ? Math.max(2, Number(input.seats || 2)) : 1;
  return {
    accountType,
    userId: String(input.userId || "").trim(),
    email: String(input.email || "").trim().toLowerCase(),
    fullName: String(input.fullName || "").trim(),
    tenantName: String(input.tenantName || "").trim(),
    firmName: accountType === "firm" ? String(input.firmName || "").trim() : undefined,
    seats,
    practiceAreas: String(input.practiceAreas || "").trim(),
    jurisdictionFocus: String(input.jurisdictionFocus || "").trim(),
  };
}

export function validatePendingSignup(signup: PendingSignup) {
  if (!signup.userId) return "A signed-up Mercy user is required before checkout.";
  if (!signup.email) return "Work email is required.";
  if (!signup.fullName) return "Full name is required.";
  if (!signup.tenantName) return "Workspace name is required.";
  if (!signup.practiceAreas) return "Practice areas are required.";
  if (!signup.jurisdictionFocus) return "Jurisdiction focus is required.";
  if (signup.accountType === "firm" && !signup.firmName) return "Firm name is required.";
  if (signup.accountType === "firm" && signup.seats < 2) return "Firm signup requires at least 2 attorney seats.";
  return null;
}

export function signupMetadata(signup: PendingSignup) {
  return {
    account_type: signup.accountType,
    user_id: signup.userId,
    email: signup.email,
    full_name: signup.fullName,
    tenant_name: signup.tenantName,
    firm_name: signup.firmName || "",
    seat_quantity: String(signup.seats),
    practice_areas: signup.practiceAreas,
    jurisdiction_focus: signup.jurisdictionFocus,
  };
}

async function findExistingTenant(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  session: Stripe.Checkout.Session,
  subscriptionId: string | null,
) {
  const filters = [`stripe_checkout_session_id.eq.${session.id}`];
  if (subscriptionId) {
    filters.push(`stripe_subscription_id.eq.${subscriptionId}`);
  }
  const { data, error } = await supabase
    .from("mercy_tenants")
    .select("tenant_id,firm_id")
    .or(filters.join(","))
    .limit(1)
    .maybeSingle();

  if (error) {
    return { error: error.message, tenantId: null as string | null, firmId: null as string | null };
  }
  return {
    error: null,
    tenantId: typeof data?.tenant_id === "string" ? data.tenant_id : null,
    firmId: typeof data?.firm_id === "string" ? data.firm_id : null,
  };
}

export async function provisionPaidSignup(session: Stripe.Checkout.Session) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { mode: "not_configured" as const };
  }

  const metadata = session.metadata || {};
  const signup = normalizeSignup({
    accountType: metadata.account_type === "firm" ? "firm" : "solo",
    userId: metadata.user_id,
    email: metadata.email,
    fullName: metadata.full_name,
    tenantName: metadata.tenant_name,
    firmName: metadata.firm_name,
    seats: Number(metadata.seat_quantity || 1),
    practiceAreas: metadata.practice_areas,
    jurisdictionFocus: metadata.jurisdiction_focus,
  });
  const validationError = validatePendingSignup(signup);
  if (validationError) {
    return { mode: "invalid" as const, error: validationError };
  }

  const subscriptionStatus = checkoutSubscriptionStatus(session);
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return { mode: "skipped" as const, subscriptionStatus };
  }

  const tenantSeed = slugify(signup.tenantName, signup.accountType);
  const roles = signup.accountType === "firm" ? ["admin", "firm_admin", "attorney"] : ["admin", "attorney"];
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id || null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null;
  const existing = await findExistingTenant(supabase, session, subscriptionId);
  if (existing.error) {
    return { mode: "storage_error" as const, error: existing.error };
  }
  const tenantId = existing.tenantId || stableId("tenant", tenantSeed, session.id);
  const firmId =
    signup.accountType === "firm"
      ? existing.firmId || stableId("firm", slugify(signup.firmName || signup.tenantName, "firm"), session.id)
      : null;

  const appMetadata = canonicalAppMetadata({
    tenantId,
    firmId,
    accountType: signup.accountType,
    roles,
    seats: signup.seats,
    subscriptionStatus,
    customerId,
    subscriptionId,
  });
  const userMetadata = {
    full_name: signup.fullName,
    firm_name: signup.firmName || null,
    tenant_name: signup.tenantName,
    practice_areas: signup.practiceAreas,
    jurisdiction_focus: signup.jurisdictionFocus,
  };

  const { error: tenantError } = await supabase.from("mercy_tenants").upsert(
    {
      tenant_id: tenantId,
      name: signup.tenantName,
      workspace_name: signup.tenantName,
      account_type: signup.accountType,
      firm_id: firmId,
      parent_firm_id: firmId,
      attorney_seat_limit: signup.seats,
      subscription_status: subscriptionStatus,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_checkout_session_id: session.id,
      practice_areas: signup.practiceAreas,
      jurisdiction_focus: signup.jurisdictionFocus,
      created_by_user_id: signup.userId,
      created_by_email: signup.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (tenantError) {
    return { mode: "storage_error" as const, error: tenantError.message };
  }

  if (firmId) {
    const { error: firmError } = await supabase.from("mercy_firms").upsert(
      {
        firm_id: firmId,
        tenant_id: tenantId,
        firm_name: signup.firmName,
        attorney_seat_limit: signup.seats,
        created_by_user_id: signup.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "firm_id" },
    );
    if (firmError) {
      return { mode: "storage_error" as const, error: firmError.message };
    }
  }

  const { error: memberError } = await supabase.from("mercy_tenant_members").upsert(
    {
      tenant_id: tenantId,
      firm_id: firmId,
      user_id: signup.userId,
      email: signup.email,
      full_name: signup.fullName,
      roles,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,user_id" },
  );
  if (memberError) {
    return { mode: "storage_error" as const, error: memberError.message };
  }

  const { error: authError } = await updateUserAccountMetadata(supabase, signup.userId, appMetadata, userMetadata);
  if (authError) {
    return { mode: "auth_error" as const, error: authError };
  }

  return { mode: "provisioned" as const, tenantId, firmId };
}

export async function syncStripeSubscriptionStatus(subscription: Stripe.Subscription) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { mode: "skipped" as const };
  }

  const status = dbSubscriptionStatus(subscription.status);
  if (!DB_SUBSCRIPTION_STATUSES.has(status)) {
    return { mode: "skipped" as const };
  }
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
  const { data: tenant, error: tenantReadError } = await supabase
    .from("mercy_tenants")
    .select("tenant_id,firm_id,account_type,attorney_seat_limit,stripe_customer_id,stripe_subscription_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (tenantReadError) {
    return { mode: "storage_error" as const, error: tenantReadError.message };
  }
  if (!tenant?.tenant_id) {
    return { mode: "skipped" as const, status, reason: "tenant_not_found" };
  }

  const { error: tenantError } = await supabase
    .from("mercy_tenants")
    .update({
      subscription_status: status,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
  if (tenantError) {
    return { mode: "storage_error" as const, error: tenantError.message };
  }

  const { data: members, error: memberError } = await supabase
    .from("mercy_tenant_members")
    .select("user_id,roles,status")
    .eq("tenant_id", tenant.tenant_id);
  if (memberError) {
    return { mode: "storage_error" as const, error: memberError.message };
  }

  const metadataUserId = typeof subscription.metadata?.user_id === "string" ? subscription.metadata.user_id : "";
  const userIds = new Set<string>();
  for (const member of members || []) {
    if (member.status === "active" && typeof member.user_id === "string" && member.user_id.trim()) {
      userIds.add(member.user_id.trim());
    }
  }
  if (metadataUserId) {
    userIds.add(metadataUserId);
  }

  const accountType = tenant.account_type === "firm" ? "firm" : "solo";
  const firmId = typeof tenant.firm_id === "string" && tenant.firm_id.trim() ? tenant.firm_id.trim() : null;
  const seats = Number(tenant.attorney_seat_limit || (accountType === "firm" ? 2 : 1));
  const fallbackRoles = accountType === "firm" ? ["admin", "firm_admin", "attorney"] : ["admin", "attorney"];
  for (const userId of userIds) {
    const member = (members || []).find((item) => item.user_id === userId);
    const roles = Array.isArray(member?.roles) && member.roles.length ? member.roles.map(String).filter(Boolean) : fallbackRoles;
    const { error } = await updateUserAccountMetadata(
      supabase,
      userId,
      canonicalAppMetadata({
        tenantId: tenant.tenant_id,
        firmId,
        accountType,
        roles,
        seats,
        subscriptionStatus: status,
        customerId,
        subscriptionId: subscription.id,
      }),
    );
    if (error) {
      return { mode: "auth_error" as const, error };
    }
  }
  return { mode: "synced" as const, status, updatedUsers: userIds.size };
}

export async function getPaidSignupActivationStatus(userId: string, checkoutSessionId?: string | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { mode: "not_configured" as const, active: false };
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userData.user) {
    return { mode: "auth_error" as const, active: false, error: userError?.message || "Supabase user was not found." };
  }

  let metadata = (userData.user.app_metadata || {}) as Record<string, unknown>;
  const statusFromMetadata = String(metadata.subscription_status || metadata.account_status || "").toLowerCase();
  const tenantFromMetadata = typeof metadata.tenant_id === "string" && metadata.tenant_id.trim() ? metadata.tenant_id.trim() : null;

  if ((!tenantFromMetadata || !ACTIVE_SUBSCRIPTION_STATUSES.has(statusFromMetadata)) && checkoutSessionId) {
    const { data: tenant, error: tenantError } = await supabase
      .from("mercy_tenants")
      .select("tenant_id,firm_id,account_type,attorney_seat_limit,subscription_status,stripe_customer_id,stripe_subscription_id,created_by_user_id")
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .maybeSingle();
    if (tenantError) {
      return { mode: "storage_error" as const, active: false, error: tenantError.message };
    }
    if (tenant?.tenant_id && tenant.created_by_user_id === userId) {
      const { data: member } = await supabase
        .from("mercy_tenant_members")
        .select("roles,status")
        .eq("tenant_id", tenant.tenant_id)
        .eq("user_id", userId)
        .maybeSingle();
      const tenantStatus = dbSubscriptionStatus(String(tenant.subscription_status || ""));
      const accountType = tenant.account_type === "firm" ? "firm" : "solo";
      const roles =
        Array.isArray(member?.roles) && member.roles.length
          ? member.roles.map(String).filter(Boolean)
          : accountType === "firm"
            ? ["admin", "firm_admin", "attorney"]
            : ["admin", "attorney"];
      if (member?.status === "active" && ACTIVE_SUBSCRIPTION_STATUSES.has(tenantStatus)) {
        const firmId = typeof tenant.firm_id === "string" && tenant.firm_id.trim() ? tenant.firm_id.trim() : null;
        const { error } = await updateUserAccountMetadata(
          supabase,
          userId,
          canonicalAppMetadata({
            tenantId: tenant.tenant_id,
            firmId,
            accountType,
            roles,
            seats: Number(tenant.attorney_seat_limit || (accountType === "firm" ? 2 : 1)),
            subscriptionStatus: tenantStatus,
            customerId: typeof tenant.stripe_customer_id === "string" ? tenant.stripe_customer_id : null,
            subscriptionId: typeof tenant.stripe_subscription_id === "string" ? tenant.stripe_subscription_id : null,
          }),
        );
        if (error) {
          return { mode: "auth_error" as const, active: false, error };
        }
        const refreshed = await supabase.auth.admin.getUserById(userId);
        metadata = (refreshed.data.user?.app_metadata || metadata) as Record<string, unknown>;
      }
    }
  }

  const subscriptionStatus = String(metadata.subscription_status || metadata.account_status || "").toLowerCase();
  const tenantId = typeof metadata.tenant_id === "string" && metadata.tenant_id.trim() ? metadata.tenant_id.trim() : null;
  const firmId = typeof metadata.firm_id === "string" && metadata.firm_id.trim() ? metadata.firm_id.trim() : null;
  const workspaceActive = metadataBooleanActive(metadata.workspace_active, metadata.account_active);
  return {
    mode: "status" as const,
    active: Boolean(tenantId && workspaceActive && ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)),
    tenantId,
    firmId,
    subscriptionStatus: subscriptionStatus || null,
    workspaceActive,
  };
}
