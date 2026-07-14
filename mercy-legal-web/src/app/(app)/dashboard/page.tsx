import { DashboardHome } from "@/components/app/pages/dashboard-home";
import { getBetaStatus, getCoreSnapshot, listLarsJobs } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function DashboardPage() {
  const auth = await getServerMercyAuthContext();
  const [snapshot, beta, lars] = await Promise.all([
    getCoreSnapshot(auth),
    getBetaStatus(auth),
    listLarsJobs(40, auth),
  ]);
  return (
    <DashboardHome
      snapshot={snapshot}
      betaStatus={beta.data ?? null}
      betaError={beta.ok ? null : beta.error}
      larsJobs={lars.data?.jobs ?? []}
    />
  );
}
