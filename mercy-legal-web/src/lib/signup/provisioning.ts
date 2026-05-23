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

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const DB_SUBSCRIPTION_STATUSES = new Set(["pending", "active", "past_due", "canceled", "incomplete"]);

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
  if (status === "trialing") return "active";
  if (status === "unpaid" || status === "paused") return "past_due";
  if (status === "active" || status === "past_due" || status === "canceled" || status === "incomplete") return status;
  return "pending";
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

  const subscriptionStatus = session.payment_status === "paid" ? "active" : "incomplete";
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

  const appMetadata = {
    tenant_id: tenantId,
    firm_id: firmId,
    account_type: signup.accountType,
    roles,
    attorney_seat_limit: signup.seats,
    subscription_status: subscriptionStatus,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
  };
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

  const { error: authError } = await supabase.auth.admin.updateUserById(signup.userId, {
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });
  if (authError) {
    return { mode: "auth_error" as const, error: authError.message };
  }

  return { mode: "provisioned" as const, tenantId, firmId };
}

export async function syncStripeSubscriptionStatus(subscription: Stripe.Subscription) {
  const supabase = getSupabaseAdmin();
  const userId = typeof subscription.metadata?.user_id === "string" ? subscription.metadata.user_id : "";
  if (!supabase) {
    return { mode: "skipped" as const };
  }

  const status = dbSubscriptionStatus(subscription.status);
  if (!DB_SUBSCRIPTION_STATUSES.has(status)) {
    return { mode: "skipped" as const };
  }
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
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

  if (userId) {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const currentAppMetadata = data.user?.app_metadata || {};
    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...currentAppMetadata,
        subscription_status: status,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
      },
    });
  }
  return { mode: "synced" as const, status };
}
