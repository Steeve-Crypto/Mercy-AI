import { LarsWorkspacePage } from "@/components/app/pages/lars-workspace-page";
import { getCoreSnapshot } from "@/lib/core-client";

export default async function LarsPage() {
  const snapshot = await getCoreSnapshot();
  const matters = (snapshot.matters || []).map((matter) => ({
    matter_id: matter.matter_id,
    name: matter.name,
  }));
  return <LarsWorkspacePage initialMatters={matters} />;
}
