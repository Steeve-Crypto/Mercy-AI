import { MattersPage } from "@/components/app/pages/workflow-pages";
import { getCoreSnapshot } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function MattersRoute() {
  const auth = await getServerMercyAuthContext();
  const snapshot = await getCoreSnapshot(auth);
  return <MattersPage matters={snapshot.matters} coreOnline={snapshot.online} />;
}
