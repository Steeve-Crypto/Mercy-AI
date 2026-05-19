import { SystemHealthAdminPage } from "@/components/app/pages/admin-pages";
import { getMonitoringMetrics } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function SystemHealthRoute() {
  const auth = await getServerMercyAuthContext();
  const metrics = await getMonitoringMetrics(auth);
  return <SystemHealthAdminPage metrics={metrics.data} />;
}
