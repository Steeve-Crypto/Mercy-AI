import { MonitoringAdminPage } from "@/components/app/pages/admin-pages";
import { getMonitoringMetrics } from "@/lib/core-client";

export default async function MonitoringRoute() {
  const metrics = await getMonitoringMetrics();
  return <MonitoringAdminPage metrics={metrics.data} error={metrics.error} />;
}

