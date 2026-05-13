import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { getCoreSnapshot } from "@/lib/core-client";

export default async function DashboardPage() {
  const coreSnapshot = await getCoreSnapshot();
  return <DashboardWorkspace initialSnapshot={coreSnapshot} />;
}
