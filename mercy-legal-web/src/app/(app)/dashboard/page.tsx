import { DashboardHome } from "@/components/app/pages/dashboard-home";
import { getBetaStatus, getCoreSnapshot } from "@/lib/core-client";

export default async function DashboardPage() {
  const [snapshot, beta] = await Promise.all([getCoreSnapshot(), getBetaStatus()]);
  return <DashboardHome snapshot={snapshot} betaStatus={beta.data} betaError={beta.error} />;
}

