import { SecurityAdminPage } from "@/components/app/pages/admin-pages";
import { getMonitoringMetrics } from "@/lib/core-client";

export default async function SecurityRoute() {
  const metrics = await getMonitoringMetrics();
  return <SecurityAdminPage metrics={metrics.data} />;
}

