import { TemplatesPage } from "@/components/app/pages/workflow-pages";
import { getTemplateGallery } from "@/lib/core-client";

export default async function TemplatesRoute() {
  const templates = await getTemplateGallery();
  return <TemplatesPage initialTemplates={templates.data?.templates ?? []} />;
}
