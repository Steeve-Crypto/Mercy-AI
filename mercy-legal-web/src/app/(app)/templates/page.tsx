import { TemplatesPage } from "@/components/app/pages/workflow-pages";
import { getTemplateGallery } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

export default async function TemplatesRoute() {
  const auth = await getServerMercyAuthContext();
  const templates = await getTemplateGallery(undefined, auth);
  return <TemplatesPage initialTemplates={templates.data?.templates ?? []} />;
}
