"use client";

import { useMemo, useState } from "react";
import { Bot, FileText, Loader2, Send, SlidersHorizontal, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ReliabilityPanel } from "@/components/app/reliability-panel";
import { executeAgent, type CoreAgentEnvelope, type CoreMatter, type CoreTemplateGalleryItem } from "@/lib/core-client";

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

export function AgentXChatPage({ initialMatters, templates, coreOnline, initialTemplateId, initialMatterId }: AgentXChatPageProps) {
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
  const [prompt, setPrompt] = useState(() => promptFromTemplate(selectedTemplate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const activeMatter = useMemo(() => initialMatters.find((matter) => matter.matter_id === matterId) ?? null, [initialMatters, matterId]);
  const lastResult = [...messages].reverse().find((message) => message.result)?.result ?? null;

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
            source_policy: useDcSources ? "official_dc_sources_first" : "matter_context_only",
          }
        : { jurisdiction: "District of Columbia" },
      params: {
        mode,
        template_id: selectedTemplate?.template_id,
        prompt_template_id: selectedTemplate?.prompt_template_id,
        source_query: selectedTemplate?.source_query,
        jurisdiction: strictDcJurisdiction ? "District of Columbia" : undefined,
        include_vault_documents: includeVaultDocuments,
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
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "assistant", content: agentOutput(data), result: data },
    ]);
  }

  return (
    <>
      <PageHeader
        eyebrow="Ask Agent X"
        title="Ask Agent X"
        description="Mercy's Hermes-powered MoE legal agent network for D.C. drafting, analysis, research support, citation checks, and matter-aware workflows."
      >
        <div className="flex flex-wrap gap-2">
          {activeMatter ? (
            <span className="rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#4338CA]">
              {activeMatter.name}
            </span>
          ) : null}
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${coreOnline ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            Core {coreOnline ? "online" : "offline"}
          </span>
        </div>
      </PageHeader>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:p-8">
        <section className="flex min-h-[calc(100vh-12rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            {selectedTemplate ? (
              <div className="mb-4 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#4F46E5]">
                    <Sparkles className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{selectedTemplate.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{selectedTemplate.description}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 xl:grid-cols-[1fr_0.62fr_0.78fr]">
              <label className="text-xs font-medium text-slate-600">
                Matter context
                <select
                  value={matterId}
                  onChange={(event) => setMatterId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="">No matter selected</option>
                  {initialMatters.map((matter) => (
                    <option key={matter.matter_id} value={matter.matter_id}>
                      {matter.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Workflow
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="template_generation">Template generation</option>
                  <option value="drafting">Drafting</option>
                  <option value="analysis">Document analysis</option>
                  <option value="dc_research">D.C. research support</option>
                  <option value="citation_verification">Citation verification</option>
                  <option value="compliance">Compliance check</option>
                  <option value="intake">Intake support</option>
                </select>
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <SlidersHorizontal className="size-3.5 text-[#4F46E5]" />
                  Context controls
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={useDcSources} onChange={(event) => setUseDcSources(event.target.checked)} />
                  Use D.C. source retrieval
                </label>
                <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={useMatterContext} onChange={(event) => setUseMatterContext(event.target.checked)} />
                  Include matter context
                </label>
                <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={includeVaultDocuments} onChange={(event) => setIncludeVaultDocuments(event.target.checked)} />
                  Include vault documents
                </label>
                <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={strictDcJurisdiction} onChange={(event) => setStrictDcJurisdiction(event.target.checked)} />
                  Jurisdiction: D.C.
                </label>
              </div>
            </div>

            {templates.length ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended template workflows</p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {templates.slice(0, 6).map((template) => (
                    <button
                      key={template.template_id}
                      onClick={() => {
                        setMode("template_generation");
                        setPrompt(promptFromTemplate(template));
                      }}
                      className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-[#A5B4FC] hover:bg-[#EEF2FF] hover:text-[#4338CA]"
                    >
                      {template.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length ? (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-3xl rounded-2xl p-4 text-sm leading-6 ${
                    message.role === "user"
                      ? "ml-auto bg-[#4F46E5] text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-800"
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
              ))
            ) : (
              <div className="flex h-full min-h-80 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <div>
                  <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                    <Bot className="size-6" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-950">Ask Agent X</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                    Try drafting a D.C. demand letter from matter context, or analyzing enforceability risks in a clause under D.C. law.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            {error ? <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div> : null}
            <div className="flex gap-3">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask Agent X to research, draft, analyze, verify, or explain..."
                className="min-h-28 flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]"
              />
              <button
                onClick={send}
                disabled={busy}
                className="flex w-28 items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4338CA] disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {templates.length} templates available. Agent X output requires attorney review and source verification.
            </p>
          </div>
        </section>

        <div className="space-y-4">
          <ReliabilityPanel agent={lastResult} />
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-950">
              <FileText className="size-4 text-[#4F46E5]" />
              Source toggles
            </div>
            <p className="mt-2 text-xs">
              D.C. sources, matter context, vault documents, and jurisdiction controls are sent with every Agent X request.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
