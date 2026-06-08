import { ResearchPage } from "@/components/app/pages/workflow-pages";
import { getCoreSnapshot } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

type ResearchRouteProps = {
  searchParams?: Promise<{
    matterId?: string;
    attachedDocs?: string;
    documentContext?: string;
  }>;
};

export default async function ResearchRoute({ searchParams }: ResearchRouteProps) {
  const params = await searchParams;
  const auth = await getServerMercyAuthContext();
  const snapshot = await getCoreSnapshot(auth);
  return (
    <ResearchPage
      matters={snapshot.matters}
      initialMatterId={params?.matterId}
      initialAttachedDocIds={params?.attachedDocs?.split(",").filter(Boolean) ?? []}
      initialDocumentContext={params?.documentContext === "1"}
    />
  );
}
