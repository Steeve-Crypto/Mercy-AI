import { ResearchPage } from "@/components/app/pages/workflow-pages";
import { getCoreSnapshot } from "@/lib/core-client";

export default async function ResearchRoute() {
  const snapshot = await getCoreSnapshot();
  return <ResearchPage matters={snapshot.matters} />;
}

