import { ResearchPage } from "@/components/app/pages/workflow-pages";
import { getCoreSnapshot } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function ResearchRoute() {
  const auth = await getServerMercyAuthContext();
  const snapshot = await getCoreSnapshot(auth);
  return <ResearchPage matters={snapshot.matters} />;
}
