import { VaultPage } from "@/components/app/pages/workflow-pages";
import { getCoreSnapshot } from "@/lib/core-client";

export default async function VaultRoute() {
  const snapshot = await getCoreSnapshot();
  return <VaultPage matters={snapshot.matters} />;
}

