import { BetaUsersAdminPage } from "@/components/app/pages/admin-pages";
import { getBetaAnalytics } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function BetaUsersRoute() {
  const auth = await getServerMercyAuthContext();
  const analytics = await getBetaAnalytics(auth);
  return <BetaUsersAdminPage analytics={analytics.data} error={analytics.error} />;
}
