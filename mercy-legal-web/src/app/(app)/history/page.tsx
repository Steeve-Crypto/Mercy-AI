import { HistoryPageClient } from "@/components/app/pages/history-page-client";
import { listWorkHistory } from "@/lib/work-history";

export default async function HistoryPage() {
  const result = await listWorkHistory({ limit: 50 });

  return (
    <HistoryPageClient
      initialRecords={result.records}
      configured={result.configured}
      initialError={result.configured ? result.error ?? null : null}
    />
  );
}
