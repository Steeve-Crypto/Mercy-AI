import { AgentXChatPage } from "@/components/app/pages/agent-x-chat-page";
import { getCoreSnapshot, getTemplateGallery } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

type MercyPageProps = {
  searchParams?: Promise<{
    templateId?: string;
    matterId?: string;
    attachedDocs?: string;
    attached?: string;
  }>;
};

export default async function MercyPage({ searchParams }: MercyPageProps) {
  const params = await searchParams;
  const auth = await getServerMercyAuthContext();
  const [snapshot, templates] = await Promise.all([getCoreSnapshot(auth), getTemplateGallery(undefined, auth)]);
  return (
    <AgentXChatPage
      initialMatters={snapshot.matters}
      templates={templates.data?.templates ?? []}
      coreOnline={snapshot.online}
      initialTemplateId={params?.templateId}
      initialMatterId={params?.matterId}
      initialAttachedDocIds={params?.attachedDocs?.split(",").filter(Boolean) ?? []}
      initialAttachedConfirmation={params?.attached === "1"}
    />
  );
}
