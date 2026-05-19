import { AnalyticsAdminPage } from "@/components/app/pages/admin-pages";
import { getBetaAnalytics, getMonitoringMetrics } from "@/lib/core-client";

export default async function AnalyticsRoute() {
  const [analytics, metrics] = await Promise.all([getBetaAnalytics(), getMonitoringMetrics()]);
  return <AnalyticsAdminPage analytics={analytics.data} metrics={metrics.data} />;
}

