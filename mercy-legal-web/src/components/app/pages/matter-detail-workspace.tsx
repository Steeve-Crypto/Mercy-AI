"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CreditCard,
  FileText,
  FolderOpen,
  Loader2,
  MessageSquareText,
  Search,
  UploadCloud,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  retrieveRag,
  uploadDiscoveryDocument,
  type CoreDiscoveryEnvelope,
  type CoreMatter,
  type CoreRagEnvelope,
} from "@/lib/core-client";

type MatterDetailWorkspaceProps = {
  matter: CoreMatter;
  initialError: string | null;
};

type MatterTab = "overview" | "documents" | "research" | "drafting" | "activity" | "billing";

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
  const [file, setFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<CoreDiscoveryEnvelope | null>(null);

  const documents = matter.documents ?? [];
  const deadlines = matter.deadlines ?? [];
  const activities = useMemo(() => timeline(matter, researchResult, discoveryResult), [discoveryResult, matter, researchResult]);
  const chatHref = `/chat?matterId=${encodeURIComponent(matter.matter_id)}` as Route;
  const intakeHref = `/intake?matterId=${encodeURIComponent(matter.matter_id)}` as Route;

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

  async function uploadDocument() {
    if (!file) return;
    setUploadBusy(true);
    setUploadError(null);
    const response = await uploadDiscoveryDocument({ file, matter_id: matter.matter_id });
    setUploadBusy(false);
    if (!response.ok || !response.data) {
      setUploadError(response.error ?? "Document upload failed.");
      return;
    }
    setDiscoveryResult(response.data);
  }

  return (
    <>
      <PageHeader
        eyebrow="Matter workspace"
        title={matter.name}
        description={`${matter.jurisdiction ?? "District of Columbia"} matter workspace for documents, research, drafting, activity, and usage.`}
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
                  <button onClick={() => setActiveTab("documents")} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <UploadCloud className="size-4 text-[#4F46E5]" />
                    Upload document
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
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Documents</h2>
                <p className="mt-1 text-sm text-slate-500">Matter documents and upload workflow for discovery analysis.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                <button onClick={uploadDocument} disabled={!file || uploadBusy} className="flex items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {uploadBusy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                  Upload
                </button>
              </div>
            </div>
            {uploadError ? <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{uploadError}</div> : null}
            {discoveryResult ? <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Document analyzed by {discoveryResult.engine}. Review extracted facts in Activity.</div> : null}
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {documents.length ? documents.map((document, index) => (
                <div key={`${documentTitle(document, index)}-${index}`} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-950">{documentTitle(document, index)}</p>
                  <p className="mt-2 text-sm text-slate-500">{asText(document.source ?? document.document_type ?? document.type, "Matter document")}</p>
                  <p className="mt-2 text-xs text-slate-400">{asText(document.created_at ?? document.date ?? document.uploaded_at, "Metadata pending")}</p>
                </div>
              )) : <EmptyState text="No uploaded documents are recorded on this matter yet." />}
            </div>
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
