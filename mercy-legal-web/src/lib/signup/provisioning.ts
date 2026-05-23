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

  const subscriptionStatus =
    typeof session.subscription === "string" || session.subscription
      ? "active"
      : session.payment_status === "paid"
        ? "active"
        : "incomplete";
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return { mode: "skipped" as const, subscriptionStatus };
  }

  const tenantSeed = slugify(signup.tenantName, signup.accountType);
  const tenantId = stableId("tenant", tenantSeed, session.id);
  const firmId = signup.accountType === "firm" ? stableId("firm", slugify(signup.firmName || signup.tenantName, "firm"), session.id) : null;
  const roles = signup.accountType === "firm" ? ["admin", "firm_admin", "attorney"] : ["admin", "attorney"];
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id || null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null;

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
      tenant_name: signup.tenantName,
      account_type: signup.accountType,
      firm_id: firmId,
      attorney_seat_limit: signup.seats,
      subscription_status: subscriptionStatus,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
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
  if (!supabase || !userId) {
    return { mode: "skipped" as const };
  }

  const { data } = await supabase.auth.admin.getUserById(userId);
  const currentAppMetadata = data.user?.app_metadata || {};
  const status = subscription.status;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...currentAppMetadata,
      subscription_status: status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
    },
  });
  await supabase
    .from("mercy_tenants")
    .update({
      subscription_status: status,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
  return { mode: "synced" as const, status };
}
