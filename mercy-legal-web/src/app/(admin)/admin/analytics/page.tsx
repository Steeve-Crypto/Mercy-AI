import { AnalyticsAdminPage } from "@/components/app/pages/admin-pages";
import { getBetaAnalytics, getMonitoringMetrics } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function AnalyticsRoute() {
  const auth = await getServerMercyAuthContext();
  const [analytics, metrics] = await Promise.all([getBetaAnalytics(auth), getMonitoringMetrics(auth)]);
  return <AnalyticsAdminPage analytics={analytics.data} metrics={metrics.data} />;
}
