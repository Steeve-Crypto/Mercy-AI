import { MonitoringAdminPage } from "@/components/app/pages/admin-pages";
import { getMonitoringMetrics } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function MonitoringRoute() {
  const auth = await getServerMercyAuthContext();
  const metrics = await getMonitoringMetrics(auth);
  return <MonitoringAdminPage metrics={metrics.data} error={metrics.error} />;
}
