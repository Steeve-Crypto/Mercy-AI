import { AgentXChatPage } from "@/components/app/pages/agent-x-chat-page";
import { getCoreSnapshot, getTemplateGallery } from "@/lib/core-client";

type ChatPageProps = {
  searchParams?: Promise<{
    templateId?: string;
    matterId?: string;
    attachedDocs?: string;
  }>;
};

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const params = await searchParams;
  const [snapshot, templates] = await Promise.all([getCoreSnapshot(), getTemplateGallery()]);
  return (
    <AgentXChatPage
      initialMatters={snapshot.matters}
      templates={templates.data?.templates ?? []}
      coreOnline={snapshot.online}
      initialTemplateId={params?.templateId}
      initialMatterId={params?.matterId}
      initialAttachedDocIds={params?.attachedDocs?.split(",").filter(Boolean) ?? []}
    />
  );
}
