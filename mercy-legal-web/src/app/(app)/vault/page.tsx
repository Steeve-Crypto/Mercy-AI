import { VaultPage } from "@/components/app/pages/workflow-pages";
import { getCoreSnapshot } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function VaultRoute() {
  const auth = await getServerMercyAuthContext();
  const snapshot = await getCoreSnapshot(auth);
  return <VaultPage matters={snapshot.matters} />;
}
