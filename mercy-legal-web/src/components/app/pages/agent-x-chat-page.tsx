"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpenText,
  Bot,
  Clock3,
  FileText,
  Loader2,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { ReliabilityPanel } from "@/components/app/reliability-panel";
import { executeAgent, type CoreAgentEnvelope, type CoreMatter, type CoreTemplateGalleryItem } from "@/lib/core-client";
import type { WorkHistoryRecord } from "@/lib/work-history-types";
import { createWorkHistoryClient, listWorkHistoryClient, sourceTypeForRun, workflowTypeFromMode } from "@/lib/work-history-client";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: CoreAgentEnvelope;
};

type AgentXChatPageProps = {
  initialMatters: CoreMatter[];
  templates: CoreTemplateGalleryItem[];
  coreOnline: boolean;
  initialTemplateId?: string;
  initialMatterId?: string;
  initialAttachedDocIds?: string[];
  initialAttachedConfirmation?: boolean;
};

function agentOutput(result: CoreAgentEnvelope): string {
  const output = result.agent_result ?? {};
  const draft = output.draft;
  const answer = output.answer;
  const summary = output.summary;
  if (typeof draft === "string") return draft;
  if (typeof answer === "string") return answer;
  if (typeof summary === "string") return summary;
  return "Agent X completed the request. Review the reliability panel before relying on this output.";
}

function promptFromTemplate(template?: CoreTemplateGalleryItem): string {
  if (!template) return "";
  return [
    `Use the "${template.title}" template with Agent X.`,
    `Workflow: ${template.generation_task}`,
    `Practice area: ${template.practice_area.replace(/_/g, " ")}`,
    `Required inputs to confirm: ${template.required_inputs.map((input) => input.replace(/_/g, " ")).join(", ")}`,
    `Source query: ${template.source_query}`,
    "Draft in a D.C.-specific, attorney-review-required format with citation/source verification placeholders where needed.",
  ].join("\n");
}

function documentId(document: Record<string, unknown>, index: number): string {
  const raw = document.document_id ?? document.id ?? document.filename ?? document.title ?? `matter-document-${index + 1}`;
  return String(raw).toLowerCase().replace(/[^a-z0-9-_]+/g, "-");
}

function documentName(document: Record<string, unknown>, index: number): string {
  const raw = document.title ?? document.name ?? document.filename ?? document.document_id ?? `Document ${index + 1}`;
  return String(raw);
}

function workflowLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shortText(value: string, words = 32): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length > words ? `${parts.slice(0, words).join(" ")}...` : parts.join(" ");
}

function historyReliability(record: WorkHistoryRecord): string {
  const snapshot = record.reliabilitySnapshot ?? {};
  const status = snapshot.guardrail_status ?? snapshot.status ?? snapshot.grounding_status;
  return typeof status === "string" && status.trim() ? status : "review required";
}

export function AgentXChatPage({
  initialMatters,
  templates,
  coreOnline,
  initialTemplateId,
  initialMatterId,
  initialAttachedDocIds = [],
  initialAttachedConfirmation = false,
}: AgentXChatPageProps) {
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.template_id === initialTemplateId),
    [initialTemplateId, templates],
  );
  const [matterId, setMatterId] = useState(initialMatterId ?? initialMatters[0]?.matter_id ?? "");
  const [mode, setMode] = useState(selectedTemplate ? "template_generation" : "drafting");
  const [useDcSources, setUseDcSources] = useState(true);
  const [useMatterContext, setUseMatterContext] = useState(true);
  const [includeVaultDocuments, setIncludeVaultDocuments] = useState(true);
  const [strictDcJurisdiction, setStrictDcJurisdiction] = useState(true);
  const [attachedDocIds, setAttachedDocIds] = useState(initialAttachedDocIds);
  const [showAttachConfirmation, setShowAttachConfirmation] = useState(initialAttachedConfirmation && initialAttachedDocIds.length > 0);
  const [prompt, setPrompt] = useState(() => promptFromTemplate(selectedTemplate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [workHistory, setWorkHistory] = useState<WorkHistoryRecord[]>([]);

  const activeMatter = useMemo(() => initialMatters.find((matter) => matter.matter_id === matterId) ?? null, [initialMatters, matterId]);
  const attachedDocuments = useMemo(() => {
    const matterDocuments = activeMatter?.documents ?? [];
    return attachedDocIds.map((id) => {
      const found = matterDocuments.find((document, index) => documentId(document, index) === id);
      return {
        id,
        name: found ? documentName(found, matterDocuments.indexOf(found)) : id,
        metadata: found ?? { document_id: id },
      };
    });
  }, [activeMatter?.documents, attachedDocIds]);
  const lastResult = [...messages].reverse().find((message) => message.result)?.result ?? null;

  useEffect(() => {
    let cancelled = false;
    listWorkHistoryClient({ limit: 5 })
      .then((result) => {
        if (!cancelled) setWorkHistory(result.records);
      })
      .catch(() => {
        if (!cancelled) setWorkHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function send() {
    if (!prompt.trim()) {
      setError("Enter a question or drafting instruction for Agent X.");
      return;
    }
    setBusy(true);
    setError(null);
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: prompt };
    setMessages((current) => [...current, userMessage]);
    const response = await executeAgent({
      task: prompt,
      matter_id: matterId || undefined,
      matter_context: useMatterContext
        ? {
            matter_id: activeMatter?.matter_id,
            matter_name: activeMatter?.name,
            jurisdiction: "District of Columbia",
            matter_type: activeMatter?.matter_type,
            requested_relief: activeMatter?.requested_relief,
            key_facts: activeMatter?.key_facts,
            documents: activeMatter?.documents,
            attached_document_ids: attachedDocIds,
            attached_documents: attachedDocuments.map((document) => document.metadata),
            source_policy: useDcSources ? "official_dc_sources_first" : "matter_context_only",
          }
        : { jurisdiction: "District of Columbia" },
      params: {
        mode,
        template_id: selectedTemplate?.template_id,
        prompt_template_id: selectedTemplate?.prompt_template_id,
        source_query: selectedTemplate?.source_query,
        jurisdiction: strictDcJurisdiction ? "District of Columbia" : undefined,
        include_vault_documents: includeVaultDocuments || attachedDocIds.length > 0,
        attached_document_ids: attachedDocIds,
        top_k: useDcSources ? 5 : 0,
        format: "docx",
      },
    });
    setBusy(false);
    setPrompt("");
    if (!response.ok || !response.data) {
      setError(response.error ?? "Agent X request failed.");
      return;
    }
    const data = response.data;
    const output = agentOutput(data);
    let savedRecord: WorkHistoryRecord | null = null;
    try {
      const saveResult = await createWorkHistoryClient({
        matterId: matterId || null,
        documentId: attachedDocIds[0] ?? null,
        sourceType: sourceTypeForRun(mode, matterId, attachedDocIds[0]),
        workflowType: workflowTypeFromMode(mode),
        title: `${workflowLabel(mode)}${activeMatter?.name ? ` - ${activeMatter.name}` : ""}`,
        inputSummary: shortText(prompt, 36),
        requestText: prompt,
        outputSummary: shortText(output, 44),
        outputText: output,
        reliabilitySnapshot: {
          response_envelope: data.response_envelope,
          route: data.route,
          guardrail_status: data.guardrail_status,
          confidence_score: data.confidence_score,
          grounding_policy: data.grounding_policy,
          human_review_required: data.human_review_required,
        },
        citationsSnapshot: data.citations ?? [],
        missingInputs: data.route?.missing_inputs ?? [],
        traceId: data.trace_id ?? null,
        langsmithUrl: data.langsmith_project_url ?? null,
        moeRoute: data.route ?? null,
        expertName: data.selected_expert ?? data.expert ?? data.selected_agent ?? null,
      });
      savedRecord = saveResult.record;
    } catch {
      savedRecord = null;
    }
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "assistant", content: output, result: data },
    ]);
    if (savedRecord) setWorkHistory((current) => [savedRecord!, ...current].slice(0, 6));
  }

  return (
    <div className="grid min-h-screen gap-5 bg-[#F8FAFC] p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6">
      <main className="flex min-w-0 flex-col items-center">
        <section className="w-full max-w-5xl">
          <div className="pt-8 text-center lg:pt-14">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#4F46E5] text-white shadow-sm">
              <Bot className="size-6" />
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-normal text-slate-950">Mercy</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Draft, review, research, and verify legal work with matter context.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${coreOnline ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                Core {coreOnline ? "online" : "offline"}
              </span>
              <Link href="/history" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Clock3 className="size-3.5" />
                History
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-8 max-w-4xl rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <label className="sr-only" htmlFor="mercy-matter">
                Matter context
              </label>
              <select
                id="mercy-matter"
                value={matterId}
                onChange={(event) => setMatterId(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-[#A5B4FC] focus:bg-white focus:ring-2 focus:ring-[#E0E7FF]"
              >
                <option value="">No matter selected</option>
                {initialMatters.map((matter) => (
                  <option key={matter.matter_id} value={matter.matter_id}>
                    {matter.name}
                  </option>
                ))}
              </select>

              <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                <Paperclip className="size-4 text-[#4F46E5]" />
                <span className="truncate">
                  {attachedDocIds.length ? `${attachedDocIds.length} Vault file${attachedDocIds.length === 1 ? "" : "s"}` : "Vault context"}
                </span>
              </div>

              <label className="sr-only" htmlFor="mercy-workflow">
                Workflow
              </label>
              <select
                id="mercy-workflow"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-[#A5B4FC] focus:bg-white focus:ring-2 focus:ring-[#E0E7FF]"
              >
                <option value="template_generation">Template generation</option>
                <option value="drafting">Drafting</option>
                <option value="analysis">Document analysis</option>
                <option value="dc_research">D.C. research support</option>
                <option value="citation_verification">Citation verification</option>
                <option value="compliance">Compliance check</option>
                <option value="intake">Intake support</option>
              </select>
            </div>

            {selectedTemplate ? (
              <div className="mt-3 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] p-3">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-[#4F46E5]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{selectedTemplate.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{selectedTemplate.description}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {attachedDocuments.length ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {showAttachConfirmation ? (
                  <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                    <span>Document attached to Agent X. It will be included with this request context.</span>
                    <button type="button" onClick={() => setShowAttachConfirmation(false)} aria-label="Dismiss attachment confirmation">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {attachedDocuments.map((document) => (
                    <span
                      key={document.id}
                      className="inline-flex items-center gap-2 rounded-full border border-[#C7D2FE] bg-white px-3 py-1 text-xs font-medium text-[#4338CA]"
                    >
                      <FileText className="size-3.5" />
                      {document.name}
                      <button
                        type="button"
                        onClick={() => setAttachedDocIds((current) => current.filter((id) => id !== document.id))}
                        aria-label={`Remove ${document.name}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask Mercy about this matter, draft a document, review language, or check sources..."
                className="min-h-40 w-full resize-none rounded-t-2xl border-0 bg-white px-4 py-4 text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400"
              />
              <div className="flex flex-col gap-3 border-t border-slate-200 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white">
                    <Paperclip className="size-3.5" />
                    Files and sources
                  </button>
                  <Link href="/templates" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white">
                    <BookOpenText className="size-3.5" />
                    Templates
                  </Link>
                  <Link href="/research" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white">
                    <Search className="size-3.5" />
                    D.C. research
                  </Link>
                  <button type="button" onClick={() => setMode("citation_verification")} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white">
                    <ShieldCheck className="size-3.5" />
                    Citation check
                  </button>
                  <button type="button" onClick={() => setMode("analysis")} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white">
                    <Sparkles className="size-3.5" />
                    Improve / Review
                  </button>
                  <details className="relative">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white">
                      <SlidersHorizontal className="size-3.5" />
                      Context controls
                    </summary>
                    <div className="absolute left-0 top-9 z-10 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={useDcSources} onChange={(event) => setUseDcSources(event.target.checked)} />
                        Use D.C. source retrieval
                      </label>
                      <label className="mt-2 flex items-center gap-2">
                        <input type="checkbox" checked={useMatterContext} onChange={(event) => setUseMatterContext(event.target.checked)} />
                        Include matter context
                      </label>
                      <label className="mt-2 flex items-center gap-2">
                        <input type="checkbox" checked={includeVaultDocuments} onChange={(event) => setIncludeVaultDocuments(event.target.checked)} />
                        Include vault documents
                      </label>
                      <label className="mt-2 flex items-center gap-2">
                        <input type="checkbox" checked={strictDcJurisdiction} onChange={(event) => setStrictDcJurisdiction(event.target.checked)} />
                        Jurisdiction: D.C.
                      </label>
                    </div>
                  </details>
                </div>
                <button
                  onClick={send}
                  disabled={busy}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4338CA] disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Run Mercy
                </button>
              </div>
            </div>

            {error ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div> : null}
            {!activeMatter ? (
              <div className="mt-3 flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                <p>
                  Select or create a matter to use matter-specific context. Mercy can draft general scaffolds, but matter context improves review, citations, and D.C. grounding.
                </p>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link href="/matters" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Select matter
                  </Link>
                  <Link href="/intake" className="rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-2 text-xs font-semibold text-[#4338CA] hover:bg-[#E0E7FF]">
                    Create new matter
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          {templates.length ? (
            <div className="mx-auto mt-5 max-w-4xl">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended workflows</p>
                <span className="text-xs text-slate-400">{workflowLabel(mode)}</span>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {templates.slice(0, 6).map((template) => (
                  <button
                    key={template.template_id}
                    onClick={() => {
                      setMode("template_generation");
                      setPrompt(promptFromTemplate(template));
                    }}
                    className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:border-[#A5B4FC] hover:bg-[#EEF2FF] hover:text-[#4338CA]"
                  >
                    {template.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mx-auto mt-5 grid max-w-4xl gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
            {messages.length ? (
              <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-2xl p-4 text-sm leading-6 ${
                      message.role === "user"
                        ? "ml-auto max-w-3xl bg-[#4F46E5] text-white"
                        : "max-w-3xl border border-slate-200 bg-slate-50 text-slate-800"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#4F46E5]">
                        <Bot className="size-3.5" />
                        Agent X
                      </div>
                    ) : null}
                    <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
                  </div>
                ))}
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                    <Bot className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">Start with the work, then verify.</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Ask for drafting, review, research support, or citation checking. Attorney review and source verification remain required before use.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href="/templates" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <BookOpenText className="size-3.5" />
                        Open templates
                      </Link>
                      <Link href="/research" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <FileText className="size-3.5" />
                        Run D.C. research
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-semibold text-slate-950">
                  <Clock3 className="size-4 text-[#4F46E5]" />
                  Recent work
                </div>
                <Link href="/history" className="text-xs font-semibold text-[#4F46E5] hover:underline">
                  History
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {workHistory.length ? (
                  workHistory.slice(0, 4).map((record) => (
                    <Link key={record.id} href="/history" className="block rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-white">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-slate-900">{record.title}</p>
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          {historyReliability(record)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {record.matterId ? "Matter-linked" : "General"} / {record.outputSummary ?? record.inputSummary ?? "Saved Mercy work"}
                      </p>
                    </Link>
                  ))
                ) : (
                  <p className="mt-2 text-xs">Recent Mercy work will appear here after drafting, research, review, or citation-checking runs are saved.</p>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>

      <aside className="space-y-4">
        <ReliabilityPanel agent={lastResult} />
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-950">
            <SlidersHorizontal className="size-4 text-[#4F46E5]" />
            Context sent with request
          </div>
          <p className="mt-2">
            {useDcSources ? "D.C. sources" : "D.C. sources off"}, {useMatterContext ? "matter context" : "matter context off"}, {attachedDocIds.length} Vault file
            {attachedDocIds.length === 1 ? "" : "s"}, {strictDcJurisdiction ? "D.C. jurisdiction" : "open jurisdiction"}.
          </p>
        </section>
      </aside>
    </div>
  );
}
