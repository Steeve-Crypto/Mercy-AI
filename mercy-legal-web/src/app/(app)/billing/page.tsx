import { BillingUsagePage } from "@/components/app/pages/billing-usage-page";
import { getBetaStatus, getMonitoringMetrics, listBillingInvoices } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function BillingRoute() {
  const auth = await getServerMercyAuthContext();
  const [betaStatus, metrics, invoices] = await Promise.all([
    getBetaStatus(auth),
    getMonitoringMetrics(auth),
    listBillingInvoices(auth),
  ]);

  return (
    <BillingUsagePage
      betaStatus={betaStatus.data}
      metrics={metrics.data}
      invoices={invoices.data?.invoices ?? []}
      customerPortalUrl={invoices.data?.customer_portal_url ?? null}
      betaError={betaStatus.error}
      metricsError={metrics.error}
      invoicesError={invoices.error}
    />
  );
}
