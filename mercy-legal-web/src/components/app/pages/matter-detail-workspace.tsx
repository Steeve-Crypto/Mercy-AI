"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import {
  formatActivityDetail,
  formatActivityEvent,
  formatTimestamp,
  safeList,
  safeObjectEntries,
  safeText,
  titleCase,
} from "@/lib/display-safety";
import { extractionLimitedWarning, normalizeVaultDocument, statusBadgeClasses, type VaultReadiness, type VaultStatusKey } from "@/lib/vault-documents";
import type { WorkHistoryRecord } from "@/lib/work-history-types";
import { createWorkHistoryClient, listWorkHistoryClient } from "@/lib/work-history-client";

type MatterDetailWorkspaceProps = {
  matter: CoreMatter;
  initialError: string | null;
};

type MatterTab = "overview" | "documents" | "research" | "drafting" | "activity" | "billing";
type DocumentStatus = "Uploading" | "Extracting" | "Ready for Mercy" | "Failed" | "Extraction Limited";

type MatterDocument = {
  id: string;
  filename: string;
  uploadDate: string;
  size: string;
  type: string;
  status: DocumentStatus;
  statusKey: VaultStatusKey;
  readiness: VaultReadiness;
  readinessLabel: string;
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
  if (typeof value === "string" && value.trim()) return safeText(value, fallback);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function documentId(document: Record<string, unknown>, index: number): string {
  return asText(document.document_id ?? document.id ?? document.filename ?? document.title, `matter-document-${index + 1}`);
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
    filename: normalizeVaultDocument(document, index).filename,
    uploadDate: normalizeVaultDocument(document, index).lastUpdated,
    size: normalizeVaultDocument(document, index).sizeLabel,
    type: normalizeVaultDocument(document, index).type,
    status: normalizeVaultDocument(document, index).statusLabel as DocumentStatus,
    statusKey: normalizeVaultDocument(document, index).statusKey,
    readiness: normalizeVaultDocument(document, index).readiness,
    readinessLabel: normalizeVaultDocument(document, index).readinessLabel,
    progress: typeof document.extraction_progress === "number" ? document.extraction_progress : undefined,
    factsExtracted: typeof document.facts_extracted === "number" ? document.facts_extracted : undefined,
    citationCount: typeof document.citation_count === "number" ? document.citation_count : undefined,
    previewAvailable: normalizeVaultDocument(document, index).previewAvailable,
    source: "matter",
  }));
}

function timeline(matter: CoreMatter, research: CoreRagEnvelope | null, discovery: CoreDiscoveryEnvelope | null) {
  const rows = [
    ...(matter.history ?? []).map((item, index) => ({
      id: `history-${index}`,
      label: formatActivityEvent(item.action ?? item.event ?? item.type),
      detail: formatActivityDetail(item.action ?? item.event ?? item.type, item.detail ?? item.summary ?? item.note),
      time: formatTimestamp(item.created_at ?? item.timestamp ?? item.time),
    })),
    ...(matter.route_history ?? []).map((route, index) => ({
      id: `route-${index}`,
      label: "Reliability route attached",
      detail: "Reliability route was prepared for this workflow.",
      time: "Recorded",
    })),
    ...(matter.drafts ?? []).map((draft, index) => ({
      id: `draft-${index}`,
      label: "Draft generated",
      detail: asText(draft.draft_type ?? draft.title ?? draft.summary, "Mercy draft saved."),
      time: formatTimestamp(draft.created_at ?? draft.timestamp),
    })),
  ];

  if (research) {
    rows.unshift({
      id: "live-research",
      label: "Research run completed",
      detail: "Research results were added to this matter.",
      time: "Just now",
    });
  }
  if (discovery) {
    rows.unshift({
      id: "live-discovery",
      label: "Document uploaded",
      detail: "Document was uploaded and queued for extraction review.",
      time: "Just now",
    });
  }
  return rows;
}

function historyActivity(records: WorkHistoryRecord[]) {
  return records.slice(0, 12).map((record) => ({
    id: `work-history-${record.id}`,
    label:
      record.workflowType === "research"
        ? "Research run completed"
        : record.workflowType === "citation_check"
          ? "Citation check completed"
          : record.status === "saved"
            ? "Saved output added"
            : "Mercy request completed",
    detail: record.outputSummary ?? record.inputSummary ?? "Saved Mercy work was added to this matter.",
    time: formatTimestamp(record.createdAt),
  }));
}

export function MatterDetailWorkspace({ matter, initialError }: MatterDetailWorkspaceProps) {
  const [hydrated, setHydrated] = useState(false);
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

  useEffect(() => {
    setHydrated(true);
  }, []);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [matterHistory, setMatterHistory] = useState<WorkHistoryRecord[]>([]);

  const deadlines = matter.deadlines ?? [];
  const activities = useMemo(
    () => [...historyActivity(matterHistory), ...timeline(matter, researchResult, discoveryResult)],
    [discoveryResult, matter, matterHistory, researchResult],
  );
  const chatHref = `/chat?matterId=${encodeURIComponent(matter.matter_id)}` as Route;
  const intakeHref = `/intake?matterId=${encodeURIComponent(matter.matter_id)}` as Route;
  const documentsReady = documents.filter((document) => document.readiness === "searchable").length;
  const openInputs = matter.missing_information?.length ?? 0;
  const latestRoute = matter.route_history?.[matter.route_history.length - 1] ?? null;
  const latestConfidence = latestRoute ? Math.round(latestRoute.confidence * 100) : null;
  const reliabilityItems = openInputs + (latestRoute?.missing_inputs?.length ?? 0);
  const safeFactEntries = safeObjectEntries(matter.key_facts ?? matter.facts);
  const keyFactList = safeList((matter.key_facts as Record<string, unknown> | undefined)?.key_facts ?? (matter.facts as Record<string, unknown> | undefined)?.key_facts);

  useEffect(() => {
    let cancelled = false;
    listWorkHistoryClient({ matterId: matter.matter_id, limit: 12 })
      .then((result) => {
        if (!cancelled) setMatterHistory(result.records);
      })
      .catch(() => {
        if (!cancelled) setMatterHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [matter.matter_id]);

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
          status: "Uploading",
          statusKey: "uploading",
          readiness: "not_searchable",
          readinessLabel: "Not searchable",
          previewAvailable: false,
          source: "local_upload",
        };

        setDocuments((current) => [pendingDocument, ...current]);
        addToast("info", `Uploading ${uploadFile.name}. Backend extraction will run after upload.`);

        const response = await uploadDiscoveryDocument({ file: uploadFile, matter_id: matter.matter_id });
        if (!response.ok || !response.data) {
          setUploadError(response.error ?? `Document upload failed for ${uploadFile.name}.`);
          setDocuments((current) =>
            current.map((document) => (document.id === localId ? { ...document, status: "Failed", statusKey: "failed", readiness: "not_searchable", readinessLabel: "Not searchable" } : document)),
          );
          addToast("error", response.error ?? `${uploadFile.name} failed to upload.`);
          continue;
        }

        setDiscoveryResult(response.data);
        const refreshed = await refreshDocuments();
        if (!refreshed) {
          setDocuments((current) =>
            current.map((document) => (document.id === localId ? { ...document, status: "Ready for Mercy", statusKey: "ready", readiness: "searchable", readinessLabel: "Searchable" } : document)),
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
        include_vault_documents: true,
        include_private_documents: true,
        source_policy: "official_dc_sources_first",
        workflow_mode: "dc_research",
      },
    });
    setResearchBusy(false);
    if (!response.ok || !response.data) {
      setResearchError(response.error ?? "Research failed.");
      return;
    }
    setResearchResult(response.data);
    try {
      const saved = await createWorkHistoryClient({
        matterId: matter.matter_id,
        sourceType: "matter",
        workflowType: "research",
        title: `D.C. research - ${query.trim().slice(0, 90)}`,
        inputSummary: query.trim(),
        requestText: query.trim(),
        outputSummary: `Research returned ${response.data.results.length} source result${response.data.results.length === 1 ? "" : "s"} for attorney review.`,
        outputText: response.data.results
          .slice(0, 5)
          .map((item) => `${item.citation?.label ?? item.source_id}: ${safeText(item.summary || item.text, "Summary unavailable.")}`)
          .join("\n\n"),
        reliabilitySnapshot: {
          verification: response.data.verification,
          guardrail_status: response.data.guardrail_status,
          response_envelope: response.data.response_envelope,
          route: response.data.route,
          persistence: response.data.persistence,
          source_scope: response.data.source_scope,
          source_refs: response.data.source_refs ?? [],
        },
        citationsSnapshot: response.data.citations?.length ? response.data.citations : response.data.source_refs ?? [],
        retrievalRunId: response.data.persistence?.retrieval_run_id ?? null,
        reliabilitySnapshotId: response.data.persistence?.reliability_snapshot_id ?? null,
        moeRoute: response.data.route ?? null,
      });
      if (saved.record) setMatterHistory((current) => [saved.record!, ...current].slice(0, 12));
    } catch {
      // Matter research remains usable even when history persistence is unavailable.
    }
  }

  return (
    <div data-testid="matter-workspace-ready" data-ready={hydrated} className="p-5 lg:p-8">
      <section className="mb-5 rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--mercy-border-strong)] bg-[var(--mercy-secondary)] px-3 py-1 text-xs font-medium text-[var(--mercy-navy-soft)]">
                Matter workspace
              </span>
              <span className="rounded-full border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] px-3 py-1 text-xs font-medium text-[var(--mercy-fg-muted)]">
                {matter.jurisdiction ?? "District of Columbia"}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-normal text-[var(--mercy-fg-strong)]">{matter.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--mercy-fg-muted)]">
              {matter.client_name ?? "Client"} · {matter.matter_type ?? "General matter"} · Keep documents, research, Agent X work, and reliability review tied to this matter.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={chatHref} className="rounded-lg bg-[var(--mercy-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--mercy-navy-soft)]">
              Ask Agent X
            </Link>
            <Link href={intakeHref} className="rounded-lg border border-slate-300 bg-[var(--mercy-card)] px-4 py-2 text-sm font-semibold text-[var(--mercy-fg)] hover:bg-[var(--mercy-secondary)]">
              New Intake
            </Link>
          </div>
        </div>
      </section>
        {toasts.length ? (
          <div className="fixed right-5 top-5 z-50 w-80 space-y-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`flex items-start justify-between gap-3 rounded-xl border bg-[var(--mercy-card)] p-4 text-sm shadow-lg ${
                  toast.tone === "success"
                    ? "border-emerald-200 text-emerald-800"
                    : toast.tone === "error"
                      ? "border-rose-200 text-rose-800"
                      : "border-[var(--mercy-border-strong)] text-[var(--mercy-navy-soft)]"
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

        <div className="mb-5 overflow-x-auto rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-2 shadow-[var(--mercy-shadow)]">
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-[var(--mercy-secondary)] text-[var(--mercy-navy-soft)]" : "text-[var(--mercy-fg-muted)] hover:bg-[var(--mercy-muted)] hover:text-[var(--mercy-fg-strong)]"
                  }`}
                >
                  <tab.icon className="size-4" />
                  {tab.label}
                  {tab.id === "documents" && documents.length ? (
                    <span className="rounded-full bg-[color-mix(in_srgb,var(--mercy-card)_80%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold">{documents.length}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "overview" ? (
          <div className="space-y-5">
            <section className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[var(--mercy-border-strong)] bg-[var(--mercy-secondary)] px-3 py-1 text-xs font-medium text-[var(--mercy-navy-soft)]">
                      Matter command center
                    </span>
                    <span className="rounded-full border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] px-3 py-1 text-xs font-medium text-[var(--mercy-fg-muted)]">
                      {matter.jurisdiction ?? "District of Columbia"}
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-normal text-[var(--mercy-fg-strong)]">{matter.name}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--mercy-fg-muted)]">
                    Keep facts, documents, assistant work, source review, and attorney-control checks tied to this matter before using output in client work.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <CommandMetric label="Documents" value={`${documentsReady}/${documents.length}`} />
                  <CommandMetric label="Open inputs" value={openInputs} />
                  <CommandMetric label="Reliability" value={latestConfidence ? `${latestConfidence}%` : "Pending"} />
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CommandAction
                icon={UploadCloud}
                label="Documents"
                detail="Upload, preview, attach, or remove matter documents."
                onClick={openDocumentUpload}
                tone="default"
              />
              <Link href={chatHref} className="rounded-xl border border-[var(--mercy-border-strong)] bg-[var(--mercy-secondary)] p-5 shadow-[var(--mercy-shadow)] transition hover:border-[color-mix(in srgb, var(--mercy-gold) 45%, var(--mercy-border))] hover:bg-[#E0E7FF]">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--mercy-card)] text-[var(--mercy-navy)]">
                    <Bot className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--mercy-fg-strong)]">Assistant</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--mercy-fg-muted)]">Ask, draft, analyze, or cite-check with this matter loaded.</p>
                  </div>
                </div>
              </Link>
              <CommandAction
                icon={Search}
                label="Research"
                detail="Run D.C.-focused source retrieval against this matter."
                onClick={() => setActiveTab("research")}
                tone="default"
              />
              <CommandAction
                icon={MessageSquareText}
                label="Drafting"
                detail="Open drafting guidance and move into Assistant work."
                onClick={() => setActiveTab("drafting")}
                tone="default"
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--mercy-fg-strong)]">Matter record</h2>
                    <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">Core matter fields that inform Mercy Assistant, research, and drafting requests.</p>
                  </div>
                  {reliabilityItems ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      {reliabilityItems} review item{reliabilityItems === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      Ready for review
                    </span>
                  )}
                </div>
                <dl className="mt-5 grid gap-4 md:grid-cols-2">
                  <Info label="Client" value={matter.client_name ?? matter.client_id} />
                  <Info label="Matter type" value={matter.matter_type} />
                  <Info label="Client role" value={matter.client_role} />
                  <Info label="Requested relief" value={matter.requested_relief} />
                  <Info label="Opposing parties" value={matter.opposing_parties?.map((party) => safeText(party, "")).filter(Boolean).join(", ")} />
                  <Info label="Sensitivity" value={matter.sensitivity_flags?.map((flag) => titleCase(safeText(flag, ""))).filter(Boolean).join(", ")} />
                </dl>
                <div className="mt-5 rounded-xl bg-[var(--mercy-secondary)] p-4">
                  <p className="text-sm font-semibold text-[var(--mercy-fg-strong)]">Key facts</p>
                  {safeFactEntries.length || keyFactList.length ? (
                    <div className="mt-3 space-y-3">
                      {keyFactList.length ? (
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--mercy-fg-muted)]">
                          {keyFactList.map((fact) => <li key={fact}>{fact}</li>)}
                        </ul>
                      ) : null}
                      {safeFactEntries.map((entry) => (
                        <div key={entry.label}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--mercy-fg-muted)]">{entry.label}</p>
                          <p className="mt-1 text-sm leading-6 text-[var(--mercy-fg)]">{entry.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-[var(--mercy-fg-muted)]">
                      Key facts are still being prepared from intake and documents. Review source documents before relying on extracted facts.
                    </p>
                  )}
                </div>
              </div>

              <aside className="space-y-5">
                <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
                  <div className="flex items-center gap-2 text-lg font-semibold text-[var(--mercy-fg-strong)]">
                    <ShieldCheck className="size-5 text-[var(--mercy-navy)]" />
                    Reliability status
                  </div>
                  <div className="mt-4 space-y-3">
                    <ReliabilityRow label="Latest route" value={latestRoute ? `${latestRoute.expert_label} / ${latestRoute.route_mode}` : "No route yet"} />
                    <ReliabilityRow label="Confidence" value={latestConfidence ? `${latestConfidence}%` : "Pending"} />
                    <ReliabilityRow label="Open inputs" value={reliabilityItems ? `${reliabilityItems} item${reliabilityItems === 1 ? "" : "s"}` : "None recorded"} />
                  </div>
                  <p className="mt-4 text-xs leading-5 text-[var(--mercy-fg-muted)]">
                    Attorney review remains required. Use the Reliability Panel after Assistant or research output before relying on citations or conclusions.
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
                  <h2 className="text-lg font-semibold text-[var(--mercy-fg-strong)]">Office workflow</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--mercy-fg-muted)]">
                    Use this matter as the source of truth before continuing drafting or selected-text review in Word and Outlook.
                  </p>
                  <div className="mt-4 grid gap-2">
                    <Link href={chatHref} className="flex items-center gap-3 rounded-lg border border-[var(--mercy-border)] p-3 text-sm font-semibold text-[var(--mercy-fg)] hover:bg-[var(--mercy-secondary)]">
                      <FileText className="size-4 text-[var(--mercy-navy)]" />
                      Prepare work for Word
                    </Link>
                    <Link href={chatHref} className="flex items-center gap-3 rounded-lg border border-[var(--mercy-border)] p-3 text-sm font-semibold text-[var(--mercy-fg)] hover:bg-[var(--mercy-secondary)]">
                      <MessageSquareText className="size-4 text-[var(--mercy-navy)]" />
                      Review selected email context
                    </Link>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
                  <h2 className="text-lg font-semibold text-[var(--mercy-fg-strong)]">Deadlines</h2>
                  <div className="mt-4 space-y-3">
                    {deadlines.length ? deadlines.map((deadline, index) => (
                      <div key={index} className="rounded-lg bg-[var(--mercy-secondary)] p-3">
                        <p className="text-sm font-semibold text-[var(--mercy-fg-strong)]">{asText(deadline.title ?? deadline.name ?? deadline.type, `Deadline ${index + 1}`)}</p>
                        <p className="mt-1 text-xs text-[var(--mercy-fg-muted)]">{asText(deadline.date ?? deadline.due_date ?? deadline.deadline)}</p>
                      </div>
                    )) : <EmptyState text="No deadlines recorded yet." />}
                  </div>
                </div>
              </aside>
            </section>
          </div>
        ) : null}

        {activeTab === "documents" ? (
          <section className="space-y-5">
            <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--mercy-fg-strong)]">Documents</h2>
                  <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">
                    Upload PDFs for backend extraction. Metadata, facts, and citations are read from the persisted matter record.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={refreshDocuments}
                    disabled={documentsLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-[var(--mercy-card)] px-3 py-2 text-xs font-semibold text-[var(--mercy-fg)] hover:bg-[var(--mercy-secondary)] disabled:opacity-60"
                  >
                    {documentsLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={open}
                    disabled={uploadBusy}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--mercy-navy)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--mercy-navy-soft)] disabled:opacity-60"
                  >
                    <Plus className="size-3.5" />
                    New Document
                  </button>
                  <span className="rounded-full border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] px-3 py-1 text-xs font-medium text-[var(--mercy-fg-muted)]">
                    {documents.length} document{documents.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div
                {...getRootProps()}
                className={`mt-5 rounded-xl border-2 border-dashed p-6 text-center transition ${
                  isDragActive
                    ? "border-[var(--mercy-navy)] bg-[var(--mercy-secondary)] shadow-inner"
                    : uploadBusy
                      ? "border-[color-mix(in srgb, var(--mercy-gold) 45%, var(--mercy-border))] bg-[#F8FAFC]"
                      : "border-slate-300 bg-[var(--mercy-secondary)] hover:border-[color-mix(in srgb, var(--mercy-gold) 45%, var(--mercy-border))] hover:bg-[#F8FAFC]"
                }`}
              >
                <input {...getInputProps()} />
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[var(--mercy-card)] text-[var(--mercy-navy)] shadow-[var(--mercy-shadow)]">
                  {uploadBusy ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
                </div>
                <h3 className="mt-4 text-base font-semibold text-[var(--mercy-fg-strong)]">
                  {isDragActive ? "Drop PDFs to upload" : uploadBusy ? "Uploading and extracting" : "Drag PDFs here or choose files"}
                </h3>
                <p className="mt-2 text-sm text-[var(--mercy-fg-muted)]">
                  PDF files are stored by the Mercy core. Extraction and indexing stay on the backend.
                </p>
                <button
                  type="button"
                  onClick={open}
                  disabled={uploadBusy}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--mercy-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--mercy-navy-soft)] disabled:opacity-60"
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
                  <div key={item} className="h-52 animate-pulse rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
                    <div className="h-4 w-2/3 rounded bg-slate-200" />
                    <div className="mt-4 h-3 w-1/2 rounded bg-[var(--mercy-muted)]" />
                    <div className="mt-8 h-16 rounded bg-[var(--mercy-muted)]" />
                  </div>
                ))}
              </div>
            ) : documents.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {documents.map((document) => (
                  <article key={document.id} data-testid="matter-document-card" className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[var(--mercy-secondary)] text-[var(--mercy-navy)]">
                          <FileText className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-[var(--mercy-fg-strong)]">{document.filename}</h3>
                          <p className="mt-1 text-xs text-[var(--mercy-fg-muted)]">{document.type}</p>
                        </div>
                      </div>
                      <StatusBadge status={document.status} statusKey={document.statusKey} progress={document.progress} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${document.readiness === "searchable" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : document.readiness === "limited" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-[var(--mercy-border)] bg-[var(--mercy-secondary)] text-[var(--mercy-fg-muted)]"}`}>
                        {document.readinessLabel}
                      </span>
                      <span className="rounded-full border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--mercy-fg-muted)]">
                        Attached to Matter
                      </span>
                    </div>

                    {document.readiness === "limited" ? (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span>{extractionLimitedWarning}</span>
                      </div>
                    ) : null}

                    <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                      <DocumentMetric label="Uploaded" value={document.uploadDate} />
                      <DocumentMetric label="Size" value={document.size} />
                      <DocumentMetric label="Facts" value={document.factsExtracted ?? 0} />
                      <DocumentMetric label="Citations" value={document.citationCount ?? 0} />
                    </dl>

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => previewDocument(document)}
                        disabled={!document.previewAvailable || previewingId === document.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--mercy-border)] px-3 py-2 text-xs font-semibold text-[var(--mercy-fg)] hover:border-[var(--mercy-border-strong)] hover:bg-[var(--mercy-secondary)] hover:text-[var(--mercy-navy-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {previewingId === document.id ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                        Preview
                      </button>
                      {document.readiness === "searchable" ? (
                        <Link
                          href={`/chat?matterId=${encodeURIComponent(matter.matter_id)}&attachedDocs=${encodeURIComponent(document.id)}&attached=1` as Route}
                          onClick={() => addToast("success", `${document.filename} attached to Mercy.`)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--mercy-navy)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--mercy-navy-soft)]"
                        >
                          <Paperclip className="size-3.5" />
                          Use in Mercy
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--mercy-muted)] px-3 py-2 text-xs font-semibold text-slate-400"
                        >
                          <Paperclip className="size-3.5" />
                          Use in Mercy
                        </button>
                      )}
                      <Link
                        href={`/research?matterId=${encodeURIComponent(matter.matter_id)}&attachedDocs=${encodeURIComponent(document.id)}&documentContext=1` as Route}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--mercy-border-strong)] px-3 py-2 text-xs font-semibold text-[var(--mercy-navy-soft)] hover:bg-[var(--mercy-secondary)]"
                      >
                        <Search className="size-3.5" />
                        Use in Research
                      </Link>
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
              <div className="rounded-xl border border-dashed border-slate-300 bg-[var(--mercy-card)] p-8 text-center shadow-[var(--mercy-shadow)]">
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[var(--mercy-secondary)] text-[var(--mercy-navy)]">
                  <FileText className="size-6" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-[var(--mercy-fg-strong)]">No documents yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--mercy-fg-muted)]">
                  Drag and drop approved PDFs above. Ready documents can be previewed, attached to Mercy, or removed from the matter.
                </p>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "research" ? (
          <section className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
            <h2 className="text-lg font-semibold text-[var(--mercy-fg-strong)]">Matter research</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Research a D.C. issue using this matter context..." className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[var(--mercy-navy)] focus:ring-2 focus:ring-[var(--mercy-border-strong)]" />
              <button onClick={runResearch} disabled={researchBusy} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--mercy-navy)] px-5 text-sm font-semibold text-white disabled:opacity-60">
                {researchBusy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Research
              </button>
            </div>
            {researchError ? <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{researchError}</div> : null}
            <div className="mt-5 space-y-3">
              {researchResult ? (
                <div className="rounded-xl border border-[var(--mercy-border-strong)] bg-[var(--mercy-secondary)] p-4">
                  <p className="text-sm font-semibold text-[var(--mercy-fg-strong)]">Reliability summary</p>
                  <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">
                    Retrieval completed with review warnings. {researchResult.results.length} source result{researchResult.results.length === 1 ? "" : "s"} returned. Use Mercy Assistant for full reliability review before relying on these results.
                  </p>
                </div>
              ) : <EmptyState text="Run research to retrieve D.C. source metadata for this matter." />}
              {researchResult?.results.map((item) => (
                <div key={item.chunk_id} className="rounded-xl border border-[var(--mercy-border)] p-4">
                  <p className="font-semibold text-[var(--mercy-fg-strong)]">{item.citation?.label ?? item.source_id}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--mercy-fg-muted)]">{safeText(item.summary || item.text, "Summary unavailable. Review the source before use.")}</p>
                  <p className="mt-2 text-xs text-[var(--mercy-fg-muted)]">Source relevance {Math.round(item.combined_score * 100)}%. Attorney review required before use.</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "drafting" ? (
          <section className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-6 shadow-[var(--mercy-shadow)]">
            <h2 className="text-lg font-semibold text-[var(--mercy-fg-strong)]">Drafting with Mercy</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--mercy-fg-muted)]">
              Open Mercy with this matter preloaded. Mercy will receive matter ID, D.C. jurisdiction, facts, documents, requested relief, and source toggles.
            </p>
            <Link href={chatHref} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--mercy-navy)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--mercy-navy-soft)]">
              <Bot className="size-4" />
              Open in Mercy
            </Link>
          </section>
        ) : null}

        {activeTab === "activity" ? (
          <section className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
            <h2 className="text-lg font-semibold text-[var(--mercy-fg-strong)]">Activity</h2>
            <div className="mt-5 space-y-4">
              {activities.length ? activities.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--mercy-secondary)] text-[var(--mercy-navy)]">
                    <Activity className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--mercy-fg-strong)]">{item.label}</p>
                    <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">{item.detail}</p>
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
            <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)] md:col-span-3">
              <h2 className="text-lg font-semibold text-[var(--mercy-fg-strong)]">Usage notes</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--mercy-fg-muted)]">
                Billing and saved-time outputs require attorney review. Engagement terms and D.C. fee-reasonableness duties control any client charge.
              </p>
            </div>
          </section>
        ) : null}
      </div>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl bg-[var(--mercy-secondary)] p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--mercy-fg-muted)]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-[var(--mercy-fg-strong)]">{asText(value, "Not provided yet")}</dd>
    </div>
  );
}

function StatusBadge({ status, statusKey, progress }: { status: DocumentStatus; statusKey: VaultStatusKey; progress?: number }) {
  const Icon = statusKey === "ready" ? CheckCircle2 : statusKey === "uploading" || statusKey === "extracting" ? Loader2 : AlertTriangle;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClasses(statusKey)}`}>
      <Icon className={`size-3.5 ${statusKey === "uploading" || statusKey === "extracting" ? "animate-spin" : ""}`} />
      {status}
      {typeof progress === "number" && statusKey !== "ready" ? ` ${progress}%` : ""}
    </span>
  );
}

function DocumentMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-[var(--mercy-secondary)] p-3">
      <dt className="font-medium text-[var(--mercy-fg-muted)]">{label}</dt>
      <dd className="mt-1 truncate font-semibold text-[var(--mercy-fg-strong)]">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-[var(--mercy-secondary)] p-5 text-sm text-[var(--mercy-fg-muted)]">{text}</div>;
}

function UsageCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
      <p className="text-sm text-[var(--mercy-fg-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--mercy-fg-strong)]">{value}</p>
    </div>
  );
}

function CommandMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--mercy-fg-muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-[var(--mercy-fg-strong)]">{value}</p>
    </div>
  );
}

function CommandAction({
  icon: Icon,
  label,
  detail,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  onClick: () => void;
  tone: "default";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 text-left shadow-[var(--mercy-shadow)] transition hover:border-[color-mix(in srgb, var(--mercy-gold) 45%, var(--mercy-border))] hover:bg-[var(--mercy-secondary)]"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--mercy-muted)] text-[var(--mercy-navy)]">
          <Icon className="size-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-[var(--mercy-fg-strong)]">{label}</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--mercy-fg-muted)]">{detail}</p>
        </div>
      </div>
    </button>
  );
}

function ReliabilityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--mercy-secondary)] p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--mercy-fg-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--mercy-fg-strong)]">{value}</p>
    </div>
  );
}
