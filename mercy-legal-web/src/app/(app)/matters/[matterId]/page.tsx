import { notFound } from "next/navigation";
import { MatterDetailWorkspace } from "@/components/app/pages/matter-detail-workspace";
import { getMatter, listMatterDocuments } from "@/lib/core-client";
import { getServerMercyAuthContext } from "@/lib/auth/session";

type MatterDetailPageProps = {
  params: Promise<{
    matterId: string;
  }>;
};

export default async function MatterDetailPage({ params }: MatterDetailPageProps) {
  const { matterId } = await params;
  const auth = await getServerMercyAuthContext();
  const [matter, documents] = await Promise.all([getMatter(matterId, auth), listMatterDocuments(matterId, auth)]);

  if (!matter.data) {
    notFound();
  }

  return (
    <MatterDetailWorkspace
      matter={{ ...matter.data, documents: documents.data?.documents ?? matter.data.documents ?? [] }}
      initialError={matter.error || documents.error}
    />
  );
}
