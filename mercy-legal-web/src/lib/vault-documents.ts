import { formatTimestamp, safeText, titleCase } from "@/lib/display-safety";

export type VaultReadiness = "searchable" | "not_searchable" | "limited";
export type VaultStatusKey = "uploading" | "extracting" | "ready" | "limited" | "failed";

export type VaultDocumentView = {
  id: string;
  filename: string;
  matterId: string | null;
  matterName: string;
  type: string;
  statusKey: VaultStatusKey;
  statusLabel: string;
  readiness: VaultReadiness;
  readinessLabel: string;
  lastUpdated: string;
  uploadedAt: string;
  sizeLabel: string;
  pageCountLabel: string | null;
  factsExtracted: number;
  citationCount: number;
  previewAvailable: boolean;
  searchText: string;
  raw: Record<string, unknown>;
};

export const extractionLimitedWarning =
  "Extraction was limited. Mercy may not be able to retrieve reliable context from this document. Attorney review required.";

export function formatBytes(bytes: unknown): string {
  if (typeof bytes === "string" && bytes.trim()) return safeText(bytes, "Size pending");
  if (typeof bytes !== "number" || bytes <= 0) return "Size pending";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function documentId(document: Record<string, unknown>, index: number): string {
  return safeText(document.document_id ?? document.id ?? document.filename ?? document.title, `matter-document-${index + 1}`);
}

export function documentName(document: Record<string, unknown>, index: number): string {
  return safeText(document.title ?? document.name ?? document.filename ?? document.document_id, `Document ${index + 1}`);
}

export function documentStatusKey(document: Record<string, unknown>): VaultStatusKey {
  const status = String(document.status ?? document.extraction_status ?? "").trim().toLowerCase();
  const progress = typeof document.extraction_progress === "number" ? document.extraction_progress : null;
  if (status.includes("fail") || status === "error") return "failed";
  if (status.includes("limited") || status === "extraction_limited") return "limited";
  if (status.includes("upload")) return "uploading";
  if (status.includes("process") || status.includes("extract") || (progress !== null && progress < 100)) return "extracting";
  return "ready";
}

export function documentStatusLabel(document: Record<string, unknown>): string {
  const key = documentStatusKey(document);
  if (key === "uploading") return "Uploading";
  if (key === "extracting") return "Extracting";
  if (key === "limited") return "Extraction Limited";
  if (key === "failed") return "Failed";
  return "Ready for Mercy";
}

export function documentReadiness(document: Record<string, unknown>): VaultReadiness {
  const key = documentStatusKey(document);
  if (key === "ready") return "searchable";
  if (key === "limited") return "limited";
  return "not_searchable";
}

export function documentReadinessLabel(readiness: VaultReadiness): string {
  if (readiness === "searchable") return "Searchable";
  if (readiness === "limited") return "Limited";
  return "Not searchable";
}

export function normalizeVaultDocument(
  document: Record<string, unknown>,
  index: number,
  matter?: { matter_id?: string | null; name?: string | null },
): VaultDocumentView {
  const id = documentId(document, index);
  const filename = documentName(document, index);
  const statusKey = documentStatusKey(document);
  const readiness = documentReadiness(document);
  const matterName = safeText(document.matter_name ?? matter?.name, matter?.matter_id ? "Matter pending" : "Unassigned");
  const lastUpdatedRaw = document.last_updated ?? document.updated_at ?? document.uploaded_at ?? document.created_at ?? document.date;
  const uploadedRaw = document.uploaded_at ?? document.created_at ?? document.date;
  const pageCount = typeof document.page_count === "number" && document.page_count > 0 ? `${document.page_count} page${document.page_count === 1 ? "" : "s"}` : null;
  const summary = typeof document.summary === "string" ? document.summary : typeof document.preview_summary === "string" ? document.preview_summary : "";

  return {
    id,
    filename,
    matterId: safeText(document.matter_id ?? matter?.matter_id, "") || null,
    matterName,
    type: safeText(document.type ?? document.document_type ?? document.mime_type, "Legal document"),
    statusKey,
    statusLabel: documentStatusLabel(document),
    readiness,
    readinessLabel: documentReadinessLabel(readiness),
    lastUpdated: formatTimestamp(lastUpdatedRaw),
    uploadedAt: formatTimestamp(uploadedRaw),
    sizeLabel: formatBytes(document.size ?? document.file_size),
    pageCountLabel: pageCount,
    factsExtracted: typeof document.facts_extracted === "number" ? document.facts_extracted : 0,
    citationCount: typeof document.citation_count === "number" ? document.citation_count : 0,
    previewAvailable: Boolean(document.storage_path || document.preview_url || document.document_id),
    searchText: [
      filename,
      matterName,
      documentStatusLabel(document),
      documentReadinessLabel(readiness),
      formatTimestamp(uploadedRaw),
      safeText(document.uploaded_at ?? document.created_at ?? document.date, ""),
      summary,
    ]
      .join(" ")
      .toLowerCase(),
    raw: document,
  };
}

export function sourceScopeLabel(scope: unknown): string | null {
  if (scope === "mixed") return "Mixed";
  if (scope === "tenant_documents") return "Tenant Docs";
  if (scope === "public_dc_sources") return "Public D.C.";
  if (typeof scope === "string" && scope.trim()) return titleCase(scope);
  return null;
}

export function statusBadgeClasses(status: VaultStatusKey): string {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "limited") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA]";
}
