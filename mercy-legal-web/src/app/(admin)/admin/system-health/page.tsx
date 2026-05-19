import { SystemHealthAdminPage } from "@/components/app/pages/admin-pages";
import { getMonitoringMetrics } from "@/lib/core-client";

export default async function SystemHealthRoute() {
  const metrics = await getMonitoringMetrics();
  return <SystemHealthAdminPage metrics={metrics.data} />;
}

