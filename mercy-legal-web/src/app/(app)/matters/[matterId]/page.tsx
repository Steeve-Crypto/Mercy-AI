import { notFound } from "next/navigation";
import { MatterDetailWorkspace } from "@/components/app/pages/matter-detail-workspace";
import { getMatter } from "@/lib/core-client";

type MatterDetailPageProps = {
  params: Promise<{
    matterId: string;
  }>;
};

export default async function MatterDetailPage({ params }: MatterDetailPageProps) {
  const { matterId } = await params;
  const matter = await getMatter(matterId);

  if (!matter.data) {
    notFound();
  }

  return <MatterDetailWorkspace matter={matter.data} initialError={matter.error} />;
}

