"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CreditCard,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  MessageSquareText,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  deleteMatterDocument,
  listMatterDocuments,
  previewMatterDocument,
  retrieveRag,
  uploadDiscoveryDocument,
  type CoreDiscoveryEnvelope,
  type CoreMatter,
  type CoreMatterDocument,
  type CoreRagEnvelope,
} from "@/lib/core-client";

type MatterDetailWorkspaceProps = {
  matter: CoreMatter;
  initialError: string | null;
};

type MatterTab = "overview" | "documents" | "research" | "drafting" | "activity" | "billing";
type DocumentStatus = "Processing..." | "Ready" | "Failed";

type MatterDocument = {
  id: string;
  filename: string;
  uploadDate: string;
  size: string;
  type: string;
  status: DocumentStatus;
  progress?: number;
  factsExtracted?: number;
  citationCount?: number;
  previewAvailable: boolean;
  source: "matter" | "local_upload";
};

type Toast = {
  id: string;
  tone: "success" | "error" | "info";
  message: string;
};

const tabs: Array<{ id: MatterTab; label: string; icon: typeof FolderOpen }> = [
  { id: "overview", label: "Overview", icon: FolderOpen },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "research", label: "Research", icon: Search },
  { id: "drafting", label: "Drafting", icon: MessageSquareText },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "billing", label: "Billing / Usage", icon: CreditCard },
];

function asText(value: unknown, fallback = "Pending"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function documentTitle(document: Record<string, unknown>, index: number): string {
  return asText(document.title ?? document.name ?? document.filename ?? document.document_id, `Document ${index + 1}`);
}

function documentId(document: Record<string, unknown>, index: number): string {
  return asText(document.document_id ?? document.id ?? document.filename ?? document.title, `matter-document-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-");
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "Size pending";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeMatterDocuments(documents: Array<Record<string, unknown>>): MatterDocument[] {
  return documents.map((document, index) => ({
    id: documentId(document, index),
    filename: documentTitle(document, index),
    uploadDate: asText(document.uploaded_at ?? document.created_at ?? document.date, "Upload date pending"),
    size: typeof document.size === "number" ? formatBytes(document.size) : asText(document.size, "Size pending"),
    type: asText(document.type ?? document.document_type ?? document.mime_type, "PDF / legal document"),
    status:
      asText(document.status ?? document.extraction_status, "Ready") === "Failed"
        ? "Failed"
        : asText(document.status ?? document.extraction_status, "Ready") === "Processing..."
          ? "Processing..."
          : "Ready",
    progress: typeof document.extraction_progress === "number" ? document.extraction_progress : undefined,
    factsExtracted: typeof document.facts_extracted === "number" ? document.facts_extracted : undefined,
    citationCount: typeof document.citation_count === "number" ? document.citation_count : undefined,
    previewAvailable: Boolean(document.storage_path || document.preview_url || document.document_id),
    source: "matter",
  }));
}

function timeline(matter: CoreMatter, research: CoreRagEnvelope | null, discovery: CoreDiscoveryEnvelope | null) {
  const rows = [
    ...(matter.history ?? []).map((item, index) => ({
      id: `history-${index}`,
      label: asText(item.action ?? item.event ?? item.type, "Matter event"),
      detail: asText(item.detail ?? item.summary ?? item.note, "Matter history updated."),
      time: asText(item.created_at ?? item.timestamp ?? item.time, "Recorded"),
    })),
    ...(matter.route_history ?? []).map((route, index) => ({
      id: `route-${index}`,
      label: `${route.expert_label} route`,
      detail: `${route.route_mode}, ${Math.round(route.confidence * 100)}% confidence`,
      time: "Route history",
    })),
    ...(matter.drafts ?? []).map((draft, index) => ({
      id: `draft-${index}`,
      label: "Draft generated",
      detail: asText(draft.draft_type ?? draft.title ?? draft.summary, "Agent X draft saved."),
      time: asText(draft.created_at ?? draft.timestamp, "Draft event"),
    })),
  ];

  if (research) {
    rows.unshift({
      id: "live-research",
      label: "Research run",
      detail: `${research.results.length} D.C. source result(s), ${research.verification.status} verification.`,
      time: "Just now",
    });
  }
  if (discovery) {
    rows.unshift({
      id: "live-discovery",
      label: "Document uploaded",
      detail: `${discovery.engine} returned facts and citation metadata.`,
      time: "Just now",
    });
  }
  return rows;
}

export function MatterDetailWorkspace({ matter, initialError }: MatterDetailWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<MatterTab>("overview");
  const [query, setQuery] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchResult, setResearchResult] = useState<CoreRagEnvelope | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<CoreDiscoveryEnvelope | null>(null);
  const [documents, setDocuments] = useState<MatterDocument[]>(() => normalizeMatterDocuments(matter.documents ?? []));
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const deadlines = matter.deadlines ?? [];
  const activities = useMemo(() => timeline(matter, researchResult, discoveryResult), [discoveryResult, matter, researchResult]);
  const chatHref = `/chat?matterId=${encodeURIComponent(matter.matter_id)}` as Route;
  const intakeHref = `/intake?matterId=${encodeURIComponent(matter.matter_id)}` as Route;

  function addToast(tone: Toast["tone"], message: string) {
    const toast = { id: crypto.randomUUID(), tone, message };
    setToasts((current) => [toast, ...current].slice(0, 4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 4500);
  }

  const refreshDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    setDocumentsError(null);
    const response = await listMatterDocuments(matter.matter_id);
    setDocumentsLoading(false);
    if (!response.ok || !response.data) {
      setDocumentsError(response.error ?? "Could not refresh document metadata.");
      return null;
    }
    const nextDocuments = normalizeMatterDocuments(response.data.documents as CoreMatterDocument[]);
    setDocuments(nextDocuments);
    return nextDocuments;
  }, [matter.matter_id]);

  const uploadFiles = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles.length) return;
      setUploadBusy(true);
      setUploadError(null);

      for (const uploadFile of acceptedFiles) {
        const localId = `${uploadFile.name}-${uploadFile.size}-${Date.now()}`
          .toLowerCase()
          .replace(/[^a-z0-9-_]+/g, "-");
        const pendingDocument: MatterDocument = {
          id: localId,
          filename: uploadFile.name,
          uploadDate: new Date().toLocaleString(),
          size: formatBytes(uploadFile.size),
          type: uploadFile.type || "application/pdf",
          status: "Processing...",
          previewAvailable: false,
          source: "local_upload",
        };

        setDocuments((current) => [pendingDocument, ...current]);
        addToast("info", `Uploading ${uploadFile.name}. Backend extraction will run after upload.`);

        const response = await uploadDiscoveryDocument({ file: uploadFile, matter_id: matter.matter_id });
        if (!response.ok || !response.data) {
          setUploadError(response.error ?? `Document upload failed for ${uploadFile.name}.`);
          setDocuments((current) =>
            current.map((document) => (document.id === localId ? { ...document, status: "Failed" } : document)),
          );
          addToast("error", response.error ?? `${uploadFile.name} failed to upload.`);
          continue;
        }

        setDiscoveryResult(response.data);
        const refreshed = await refreshDocuments();
        if (!refreshed) {
          setDocuments((current) =>
            current.map((document) => (document.id === localId ? { ...document, status: "Ready" } : document)),
          );
        }
        addToast("success", `${uploadFile.name} uploaded and sent for extraction.`);
      }

      setUploadBusy(false);
    },
    [matter.matter_id, refreshDocuments],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
    },
    multiple: true,
    noClick: true,
    onDrop: uploadFiles,
  });

  function openDocumentUpload() {
    setActiveTab("documents");
    window.setTimeout(() => open(), 0);
  }

  async function previewDocument(document: MatterDocument) {
    setPreviewingId(document.id);
    const response = await previewMatterDocument(matter.matter_id, document.id);
    setPreviewingId(null);
    if (!response.ok || !response.data) {
      addToast("error", response.error ?? `Could not preview ${document.filename}.`);
      return;
    }
    window.open(response.data, "_blank", "noopener,noreferrer");
    addToast("success", `Opened preview for ${document.filename}.`);
  }

  async function deleteDocument(document: MatterDocument) {
    const confirmed = window.confirm(`Delete "${document.filename}" from this matter? This removes the stored upload metadata and file.`);
    if (!confirmed) return;
    setDeletingId(document.id);
    const response = await deleteMatterDocument(matter.matter_id, document.id);
    setDeletingId(null);
    if (!response.ok || !response.data) {
      addToast("error", response.error ?? `Could not delete ${document.filename}.`);
      return;
    }
    setDocuments(normalizeMatterDocuments(response.data.documents));
    addToast("success", `${document.filename} was removed from this matter.`);
    await refreshDocuments();
  }

  async function runResearch() {
    if (!query.trim()) {
      setResearchError("Enter a D.C. research question for this matter.");
      return;
    }
    setResearchBusy(true);
    setResearchError(null);
    const response = await retrieveRag({
      query,
      matter_id: matter.matter_id,
      top_k: 5,
      matter_context: {
        matter_id: matter.matter_id,
        matter_name: matter.name,
        jurisdiction: "District of Columbia",
        matter_type: matter.matter_type,
        client_role: matter.client_role,
        requested_relief: matter.requested_relief,
        key_facts: matter.key_facts,
        documents: matter.documents,
      },
    });
    setResearchBusy(false);
    if (!response.ok || !response.data) {
      setResearchError(response.error ?? "Research failed.");
      return;
    }
    setResearchResult(response.data);
  }

  return (
    <>
      <PageHeader
        eyebrow="Matter workspace"
        title={matter.name}
        description={`${matter.client_name ?? "Client"} · ${matter.matter_type ?? "General matter"} · ${matter.jurisdiction ?? "District of Columbia"}`}
      >
        <div className="flex flex-wrap gap-2">
          <Link href={chatHref} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]">
            Ask Agent X
          </Link>
          <Link href={intakeHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            New Intake
          </Link>
        </div>
      </PageHeader>

      <div className="p-5 lg:p-8">
        {toasts.length ? (
          <div className="fixed right-5 top-5 z-50 w-80 space-y-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`flex items-start justify-between gap-3 rounded-xl border bg-white p-4 text-sm shadow-lg ${
                  toast.tone === "success"
                    ? "border-emerald-200 text-emerald-800"
                    : toast.tone === "error"
                      ? "border-rose-200 text-rose-800"
                      : "border-[#C7D2FE] text-[#4338CA]"
                }`}
              >
                <span>{toast.message}</span>
                <button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {initialError ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{initialError}</div>
        ) : null}

        <div className="mb-5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-[#EEF2FF] text-[#4338CA]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <tab.icon className="size-4" />
                  {tab.label}
                  {tab.id === "documents" && documents.length ? (
                    <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold">{documents.length}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "overview" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Matter summary</h2>
              <dl className="mt-5 grid gap-4 md:grid-cols-2">
                <Info label="Client" value={matter.client_name ?? matter.client_id} />
                <Info label="Matter type" value={matter.matter_type} />
                <Info label="Client role" value={matter.client_role} />
                <Info label="Requested relief" value={matter.requested_relief} />
                <Info label="Opposing parties" value={matter.opposing_parties?.join(", ")} />
                <Info label="Sensitivity" value={matter.sensitivity_flags?.join(", ")} />
              </dl>
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">Key facts</p>
                <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {Object.keys(matter.key_facts ?? matter.facts ?? {}).length
                    ? JSON.stringify(matter.key_facts ?? matter.facts, null, 2)
                    : "No structured facts saved yet. Use Intake to add facts before drafting."}
                </pre>
              </div>
            </section>

            <aside className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">Quick actions</h2>
                <div className="mt-4 grid gap-3">
                  <Link href={chatHref} className="flex items-center gap-3 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] p-3 text-sm font-semibold text-[#4338CA]">
                    <Bot className="size-4" />
                    Ask Agent X about this matter
                  </Link>
                  <button onClick={() => setActiveTab("research")} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Search className="size-4 text-[#4F46E5]" />
                    Run matter research
                  </button>
                  <button onClick={openDocumentUpload} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <UploadCloud className="size-4 text-[#4F46E5]" />
                    New Document
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">Deadlines</h2>
                <div className="mt-4 space-y-3">
                  {deadlines.length ? deadlines.map((deadline, index) => (
                    <div key={index} className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-950">{asText(deadline.title ?? deadline.name ?? deadline.type, `Deadline ${index + 1}`)}</p>
                      <p className="mt-1 text-xs text-slate-500">{asText(deadline.date ?? deadline.due_date ?? deadline.deadline)}</p>
                    </div>
                  )) : <EmptyState text="No deadlines recorded yet." />}
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {activeTab === "documents" ? (
          <section className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Documents</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Upload PDFs for backend extraction. Metadata, facts, and citations are read from the persisted matter record.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={refreshDocuments}
                    disabled={documentsLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {documentsLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={open}
                    disabled={uploadBusy}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60"
                  >
                    <Plus className="size-3.5" />
                    New Document
                  </button>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    {documents.length} document{documents.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div
                {...getRootProps()}
                className={`mt-5 rounded-xl border-2 border-dashed p-6 text-center transition ${
                  isDragActive
                    ? "border-[#4F46E5] bg-[#EEF2FF] shadow-inner"
                    : uploadBusy
                      ? "border-[#A5B4FC] bg-[#F8FAFC]"
                      : "border-slate-300 bg-slate-50 hover:border-[#A5B4FC] hover:bg-[#F8FAFC]"
                }`}
              >
                <input {...getInputProps()} />
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                  {uploadBusy ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-950">
                  {isDragActive ? "Drop PDFs to upload" : uploadBusy ? "Uploading and extracting" : "Drag PDFs here or choose files"}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  PDF files are stored by the Mercy core. Extraction and indexing stay on the backend.
                </p>
                <button
                  type="button"
                  onClick={open}
                  disabled={uploadBusy}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60"
                >
                  {uploadBusy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                  Choose PDF files
                </button>
              </div>

              {uploadError ? <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{uploadError}</div> : null}
              {documentsError ? <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{documentsError}</div> : null}
              {discoveryResult ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>Document uploaded to {discoveryResult.engine}. Extraction status is ready for attorney review.</span>
                </div>
              ) : null}
            </div>

            {documentsLoading && !documents.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-52 animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="h-4 w-2/3 rounded bg-slate-200" />
                    <div className="mt-4 h-3 w-1/2 rounded bg-slate-100" />
                    <div className="mt-8 h-16 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : documents.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {documents.map((document) => (
                  <article key={document.id} data-testid="matter-document-card" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
                          <FileText className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-slate-950">{document.filename}</h3>
                          <p className="mt-1 text-xs text-slate-500">{document.type}</p>
                        </div>
                      </div>
                      <StatusBadge status={document.status} progress={document.progress} />
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                      <DocumentMetric label="Uploaded" value={document.uploadDate} />
                      <DocumentMetric label="Size" value={document.size} />
                      <DocumentMetric label="Facts" value={document.factsExtracted ?? 0} />
                      <DocumentMetric label="Citations" value={document.citationCount ?? 0} />
                    </dl>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => previewDocument(document)}
                        disabled={!document.previewAvailable || previewingId === document.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#C7D2FE] hover:bg-[#EEF2FF] hover:text-[#4338CA] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {previewingId === document.id ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                        Preview
                      </button>
                      {document.status === "Ready" ? (
                        <Link
                          href={`/chat?matterId=${encodeURIComponent(matter.matter_id)}&attachedDocs=${encodeURIComponent(document.id)}&attached=1` as Route}
                          onClick={() => addToast("success", `${document.filename} attached to Ask Agent X.`)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4338CA]"
                        >
                          <Paperclip className="size-3.5" />
                          Attach
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400"
                        >
                          <Paperclip className="size-3.5" />
                          Attach
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteDocument(document)}
                        disabled={deletingId === document.id || document.source === "local_upload"}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === document.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                  <FileText className="size-6" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-950">No documents yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Drag and drop approved PDFs above. Ready documents can be previewed, attached to Agent X, or removed from the matter.
                </p>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "research" ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Matter research</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Research a D.C. issue using this matter context..." className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]" />
              <button onClick={runResearch} disabled={researchBusy} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white disabled:opacity-60">
                {researchBusy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Research
              </button>
            </div>
            {researchError ? <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{researchError}</div> : null}
            <div className="mt-5 space-y-3">
              {researchResult ? (
                <div className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] p-4">
                  <p className="text-sm font-semibold text-slate-950">Reliability summary</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {researchResult.results.length} result(s), verification {researchResult.verification.status}, guardrails {researchResult.guardrail_status}.
                  </p>
                </div>
              ) : <EmptyState text="Run research to retrieve D.C. source metadata for this matter." />}
              {researchResult?.results.map((item) => (
                <div key={item.chunk_id} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-950">{item.citation?.label ?? item.source_id}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary || item.text}</p>
                  <p className="mt-2 text-xs text-slate-500">Score {Math.round(item.combined_score * 100)} / {item.verification_status}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "drafting" ? (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Drafting with Agent X</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Open Ask Agent X with this matter preloaded. Agent X will receive matter ID, D.C. jurisdiction, facts, documents, requested relief, and source toggles.
            </p>
            <Link href={chatHref} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-5 py-3 text-sm font-semibold text-white hover:bg-[#4338CA]">
              <Bot className="size-4" />
              Open in Ask Agent X
            </Link>
          </section>
        ) : null}

        {activeTab === "activity" ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Activity</h2>
            <div className="mt-5 space-y-4">
              {activities.length ? activities.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F46E5]">
                    <Activity className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.time}</p>
                  </div>
                </div>
              )) : <EmptyState text="No matter activity yet. Intake, research, uploads, and drafts will appear here." />}
            </div>
          </section>
        ) : null}

        {activeTab === "billing" ? (
          <section className="grid gap-5 md:grid-cols-3">
            <UsageCard label="Draft events" value={matter.drafts?.length ?? 0} />
            <UsageCard label="Billing events" value={matter.billing_events?.length ?? 0} />
            <UsageCard label="Documents" value={documents.length} />
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">
              <h2 className="text-lg font-semibold text-slate-950">Usage notes</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Billing and saved-time outputs require attorney review. Engagement terms and D.C. fee-reasonableness duties control any client charge.
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{asText(value)}</dd>
    </div>
  );
}

function StatusBadge({ status, progress }: { status: DocumentStatus; progress?: number }) {
  const styles =
    status === "Ready"
      ? "bg-emerald-50 text-emerald-700"
      : status === "Failed"
        ? "bg-rose-50 text-rose-700"
        : "bg-amber-50 text-amber-700";
  const Icon = status === "Ready" ? CheckCircle2 : status === "Failed" ? AlertTriangle : Loader2;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>
      <Icon className={`size-3.5 ${status === "Processing..." ? "animate-spin" : ""}`} />
      {status}
      {typeof progress === "number" && status !== "Ready" ? ` ${progress}%` : ""}
    </span>
  );
}

function DocumentMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 truncate font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{text}</div>;
}

function UsageCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
