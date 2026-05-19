import { MattersPage } from "@/components/app/pages/workflow-pages";
import { getCoreSnapshot } from "@/lib/core-client";

export default async function MattersRoute() {
  const snapshot = await getCoreSnapshot();
  return <MattersPage matters={snapshot.matters} coreOnline={snapshot.online} />;
}

