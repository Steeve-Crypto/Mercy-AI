import { LarsWorkspacePage } from "@/components/app/pages/lars-workspace-page";
import { getCoreSnapshot } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

type MatterAssignmentWorkspaceProps = {
  params: Promise<{
    matterId: string;
    jobId: string;
  }>;
};

/**
 * Contextual LARS assignment workspace only — nested under a Matter.
 * Not a top-level product page (no /lars, no /assignments landing).
 */
export default async function MatterAssignmentWorkspacePage({ params }: MatterAssignmentWorkspaceProps) {
  const { matterId, jobId } = await params;
  const auth = await getServerMercyAuthContext();
  const snapshot = await getCoreSnapshot(auth);
  const matterScope = matterId === "unassigned" ? "" : matterId;
  return (
    <LarsWorkspacePage
      matters={snapshot.matters}
      coreOnline={Boolean(snapshot.online)}
      initialJobId={jobId}
      initialMatterId={matterScope || undefined}
      workspaceOnly
    />
  );
}
