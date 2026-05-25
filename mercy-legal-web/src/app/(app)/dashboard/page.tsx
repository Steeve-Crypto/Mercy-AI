import { AgentXChatPage } from "@/components/app/pages/agent-x-chat-page";
import { getCoreSnapshot, getTemplateGallery } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function DashboardPage() {
  const auth = await getServerMercyAuthContext();
  const [snapshot, templates] = await Promise.all([getCoreSnapshot(auth), getTemplateGallery(undefined, auth)]);
  return <AgentXChatPage initialMatters={snapshot.matters} templates={templates.data?.templates ?? []} coreOnline={snapshot.online} />;
}
