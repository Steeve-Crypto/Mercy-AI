import { LarsWorkspacePage } from "@/components/app/pages/lars-workspace-page";
import { getCoreSnapshot } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

type AssignmentWorkspaceProps = {
  params: Promise<{
    jobId: string;
  }>;
};

/**
 * Contextual LARS assignment detail workspace for one job id.
 * Not a product landing page: there is no /assignments index and no /lars page.
 * Opened from Chat, Research, Matter, Vault, Dashboard, History, or Word.
 */
export default async function AssignmentWorkspacePage({ params }: AssignmentWorkspaceProps) {
  const { jobId } = await params;
  const auth = await getServerMercyAuthContext();
  const snapshot = await getCoreSnapshot(auth);
  return (
    <LarsWorkspacePage
      matters={snapshot.matters}
      coreOnline={Boolean(snapshot.online)}
      initialJobId={jobId}
      workspaceOnly
    />
  );
}
