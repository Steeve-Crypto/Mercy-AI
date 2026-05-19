import { BillingUsagePage } from "@/components/app/pages/billing-usage-page";
import { getBetaStatus, getMonitoringMetrics } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function BillingRoute() {
  const auth = await getServerMercyAuthContext();
  const [betaStatus, metrics] = await Promise.all([getBetaStatus(auth), getMonitoringMetrics(auth)]);

  return (
    <BillingUsagePage
      betaStatus={betaStatus.data}
      metrics={metrics.data}
      betaError={betaStatus.error}
      metricsError={metrics.error}
    />
  );
}
