import { BetaUsersAdminPage } from "@/components/app/pages/admin-pages";
import { getBetaAnalytics } from "@/lib/core-client";

export default async function BetaUsersRoute() {
  const analytics = await getBetaAnalytics();
  return <BetaUsersAdminPage analytics={analytics.data} error={analytics.error} />;
}

