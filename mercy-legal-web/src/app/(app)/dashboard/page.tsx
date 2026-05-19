import { DashboardHome } from "@/components/app/pages/dashboard-home";
import { getBetaStatus, getCoreSnapshot } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function DashboardPage() {
  const auth = await getServerMercyAuthContext();
  const [snapshot, beta] = await Promise.all([getCoreSnapshot(auth), getBetaStatus(auth)]);
  return <DashboardHome snapshot={snapshot} betaStatus={beta.data} betaError={beta.error} />;
}
