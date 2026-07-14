#!/usr/bin/env node
/**
 * Stripe entitlement validation for Mercy beta.
 *
 * Always runs pure mapping self-tests (no secrets required).
 * When Stripe/Supabase secrets are present, performs live configuration checks.
 *
 * Usage:
 *   node scripts/validate-stripe-entitlements.mjs
 *   node scripts/validate-stripe-entitlements.mjs --live
 *   node scripts/validate-stripe-entitlements.mjs --json
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

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

const ACTIVE = new Set(["active", "trialing"]);

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
  return ACTIVE.has(normalizeDbSubscriptionStatus(status));
}

function buildCanonicalAppMetadata({ tenantId, firmId, accountType, roles, seats, subscriptionStatus, customerId, subscriptionId }) {
  const status = normalizeDbSubscriptionStatus(subscriptionStatus);
  const workspaceActive = workspaceActiveForStatus(status);
  return {
    tenant_id: tenantId,
    firm_id: firmId,
    account_type: accountType,
    roles: [...roles],
    attorney_seat_limit: seats,
    subscription_status: status,
    account_status: status,
    workspace_active: workspaceActive,
    account_active: workspaceActive,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
  };
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

function runPureMappingTests() {
  const failures = [];

  for (const status of ["active", "trialing"]) {
    assert(workspaceActiveForStatus(status) === true, `expected workspace access for ${status}`, failures);
  }
  for (const status of ["past_due", "canceled", "incomplete", "suspended", "pending", "unpaid", "paused"]) {
    assert(workspaceActiveForStatus(status) === false, `expected no workspace access for ${status}`, failures);
  }

  assert(normalizeDbSubscriptionStatus("unpaid") === "past_due", "unpaid maps to past_due", failures);
  assert(normalizeDbSubscriptionStatus("paused") === "suspended", "paused maps to suspended", failures);
  assert(normalizeDbSubscriptionStatus("incomplete_expired") === "incomplete", "incomplete_expired maps to incomplete", failures);

  const activeMeta = buildCanonicalAppMetadata({
    tenantId: "tenant_a",
    firmId: null,
    accountType: "solo",
    roles: ["admin", "attorney"],
    seats: 1,
    subscriptionStatus: "active",
    customerId: "cus_123",
    subscriptionId: "sub_123",
  });
  assert(activeMeta.workspace_active === true, "active metadata sets workspace_active", failures);
  assert(activeMeta.account_status === "active", "active metadata sets account_status", failures);
  assert(activeMeta.stripe_customer_id === "cus_123", "active metadata preserves Stripe customer", failures);

  const canceledMeta = buildCanonicalAppMetadata({
    tenantId: "tenant_a",
    firmId: "firm_a",
    accountType: "firm",
    roles: ["admin", "firm_admin", "attorney"],
    seats: 3,
    subscriptionStatus: "canceled",
    customerId: "cus_456",
    subscriptionId: "sub_456",
  });
  assert(canceledMeta.workspace_active === false, "canceled metadata clears workspace_active", failures);
  assert(canceledMeta.account_active === false, "canceled metadata clears account_active", failures);
  assert(canceledMeta.firm_id === "firm_a", "firm metadata preserves firm_id", failures);

  return failures;
}

async function runLiveChecks() {
  const failures = [];
  const notes = [];

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID_BETA_SEAT;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey) {
    notes.push("STRIPE_SECRET_KEY missing; skipped live Stripe API checks.");
  } else {
    const stripe = new Stripe(stripeKey);
    try {
      await stripe.balance.retrieve();
      notes.push("Stripe API authentication succeeded.");
    } catch (error) {
      failures.push(`Stripe API authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!priceId) {
      failures.push("STRIPE_PRICE_ID_BETA_SEAT is not configured.");
    } else {
      try {
        const price = await stripe.prices.retrieve(priceId);
        assert(price.active === true, `Stripe price ${priceId} is not active`, failures);
        assert(price.type === "recurring", `Stripe price ${priceId} must be recurring`, failures);
        notes.push(`Stripe beta seat price ${priceId} is active and recurring.`);
      } catch (error) {
        failures.push(`Stripe price lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (!webhookSecret) {
    notes.push("STRIPE_WEBHOOK_SECRET missing; webhook signature verification cannot be confirmed from this script.");
  } else {
    notes.push("STRIPE_WEBHOOK_SECRET is present for webhook signature verification.");
  }

  if (!supabaseUrl || !serviceRole) {
    notes.push("Supabase service credentials missing; skipped tenant entitlement sample.");
  } else {
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase
      .from("mercy_tenants")
      .select("tenant_id,subscription_status,stripe_customer_id,stripe_subscription_id,account_type")
      .limit(25);
    if (error) {
      failures.push(`mercy_tenants sample failed: ${error.message}`);
    } else {
      notes.push(`Sampled ${data?.length || 0} mercy_tenants rows for entitlement posture.`);
      for (const row of data || []) {
        const status = normalizeDbSubscriptionStatus(String(row.subscription_status || "pending"));
        if (ACTIVE.has(status) && !row.stripe_customer_id && !row.stripe_subscription_id) {
          notes.push(
            `Tenant ${row.tenant_id} is ${status} without Stripe customer/subscription IDs (manual beta provision is allowed).`,
          );
        }
      }
    }
  }

  return { failures, notes };
}

function printHelp() {
  console.log(`Mercy Stripe entitlement validator

Always runs pure mapping self-tests.
Use --live to inspect Stripe/Supabase configuration when secrets are available.

Options:
  --live   Run live configuration checks
  --json   Machine-readable output

Manual hosted checklist after pure/live green:
  1. Complete a test solo checkout and confirm webhook checkout.session.completed provisions app_metadata.
  2. Confirm /api/signup/activation returns active and dashboard access works after refreshSession.
  3. Cancel or mark the subscription past_due in Stripe and confirm workspace access is denied after getUser re-read.
  4. Open billing portal and confirm customer id comes only from trusted app_metadata.
  5. Repeat for a firm multi-seat checkout.
`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const live = argv.includes("--live");
  const asJson = argv.includes("--json");

  const pureFailures = runPureMappingTests();
  const liveResult = live ? await runLiveChecks() : { failures: [], notes: ["Live checks skipped (pass --live)."] };
  const failures = [...pureFailures, ...liveResult.failures];
  const summary = {
    ok: failures.length === 0,
    pureTests: pureFailures.length === 0 ? "passed" : "failed",
    liveMode: live,
    failures,
    notes: liveResult.notes,
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Pure entitlement mapping tests: ${summary.pureTests}`);
    for (const note of summary.notes) console.log(`- ${note}`);
    if (failures.length) {
      console.log("Failures:");
      for (const failure of failures) console.log(`  x ${failure}`);
    } else {
      console.log("No failures.");
    }
  }

  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
