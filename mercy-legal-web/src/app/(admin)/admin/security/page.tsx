import { SecurityAdminPage } from "@/components/app/pages/admin-pages";
import { getMonitoringMetrics } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function SecurityRoute() {
  const auth = await getServerMercyAuthContext();
  const metrics = await getMonitoringMetrics(auth);
  return <SecurityAdminPage metrics={metrics.data} />;
}
