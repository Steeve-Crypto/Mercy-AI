"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, BriefcaseBusiness, Eye, FileText, FolderOpen, Loader2, Search, ShieldCheck, UploadCloud } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getTemplateGallery,
  retrieveRag,
  submitFullMatterIntake,
  uploadDiscoveryDocument,
  type CoreDiscoveryEnvelope,
  type CoreMatter,
  type CoreRagEnvelope,
  type CoreTemplateGalleryItem,
} from "@/lib/core-client";
import { extractionLimitedMessage, safeObjectEntries, safeText } from "@/lib/display-safety";
import { extractionLimitedWarning, normalizeVaultDocument, statusBadgeClasses, type VaultDocumentView } from "@/lib/vault-documents";
import { createWorkHistoryClient } from "@/lib/work-history-client";

type MattersPageProps = { matters: CoreMatter[]; coreOnline: boolean };
type TemplatesPageProps = { initialTemplates: CoreTemplateGalleryItem[] };
type ResearchPageProps = { matters: CoreMatter[]; initialMatterId?: string; initialAttachedDocIds?: string[]; initialDocumentContext?: boolean };
type IntakePageProps = { matters: CoreMatter[] };
type VaultPageProps = { matters: CoreMatter[] };

export function MattersPage({ matters, coreOnline }: MattersPageProps) {
  return (
    <div className="space-y-5 p-5 lg:p-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-950">Matters</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Matters organize client context. Vault stores documents. Agent X uses selected matter context.
              </p>
            </div>
            <span className="w-fit shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              Core {coreOnline ? "online" : "unavailable"}
            </span>
          </div>
        </section>
        <section className="space-y-3">
          {matters.length ? matters.map((matter) => (
            <Link
              key={matter.matter_id}
              href={`/matters/${encodeURIComponent(matter.matter_id)}` as Route}
              className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#A5B4FC] hover:bg-[#F8FAFF]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-950">{matter.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{matter.client_name ?? matter.client_id} / {matter.matter_type ?? "type pending"}</p>
                </div>
                <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#4338CA]">{matter.jurisdiction ?? "D.C."}</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{matter.missing_information?.length ?? 0} open intake item(s), {matter.documents?.length ?? 0} document(s).</p>
            </Link>
          )) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                <BriefcaseBusiness className="size-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-950">Create your first matter</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Create a matter to connect documents, Assistant threads, research, and reliability review.
              </p>
              <Link href="/intake" className="mt-5 inline-flex rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]">
                Create your first matter
              </Link>
            </div>
          )}
        </section>
    </div>
  );
}

export function IntakePage({ matters }: IntakePageProps) {
  const [matterId, setMatterId] = useState(matters[0]?.matter_id ?? "");
  const [facts, setFacts] = useState("");
  const [requestedRelief, setRequestedRelief] = useState("");
  const [opposingParties, setOpposingParties] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await submitFullMatterIntake({
      matter_id: matterId || undefined,
      matter: { jurisdiction: "District of Columbia", matter_name: matters.find((m) => m.matter_id === matterId)?.name ?? "New intake matter" },
      facts: { summary: facts },
      requested_relief: requestedRelief,
      opposing_parties: opposingParties.split(",").map((item) => item.trim()).filter(Boolean),
      sensitivity_flags: ["confidential_client_matter"],
      scope: { scope_of_work: requestedRelief, excluded_work: ["final legal advice without attorney review"] },
      conflicts: { checked: false, status: "ready_for_review" },
      consent: { sensitivity_flags: ["confidential_client_matter"] },
    });
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Intake failed.");
      return;
    }
    setResult(`Saved intake for ${response.data.intake_summary.matter_name}. Missing items: ${response.data.intake_summary.missing_information_count}.`);
  }

  return (
    <div className="p-5 lg:p-8">
        <form onSubmit={submit} className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-slate-950">Intake</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Capture the minimum matter facts Agent X needs before research, drafting, or document review.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Matter<select value={matterId} onChange={(event) => setMatterId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3"><option value="">Create from intake</option>{matters.map((m) => <option key={m.matter_id} value={m.matter_id}>{m.name}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Requested relief<input value={requestedRelief} onChange={(event) => setRequestedRelief(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
          </div>
          <label className="mt-4 block text-sm font-medium text-slate-700">Opposing parties<input value={opposingParties} onChange={(event) => setOpposingParties(event.target.value)} placeholder="Comma-separated" className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
          <label className="mt-4 block text-sm font-medium text-slate-700">Facts and posture<textarea value={facts} onChange={(event) => setFacts(event.target.value)} className="mt-1 min-h-40 w-full rounded-lg border border-slate-300 px-3 py-3" /></label>
          {error ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}
          {result ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{result}</p> : null}
          <button disabled={busy} className="mt-5 flex h-11 items-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white">{busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}Save intake</button>
        </form>
    </div>
  );
}

export function ResearchPage({ matters, initialMatterId, initialAttachedDocIds = [], initialDocumentContext = false }: ResearchPageProps) {
  const [matterId, setMatterId] = useState(initialMatterId ?? matters[0]?.matter_id ?? "");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CoreRagEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runResearch() {
    setBusy(true);
    setError(null);
    const activeMatter = matters.find((matter) => matter.matter_id === matterId);
    const selectedDocuments = (activeMatter?.documents ?? []).filter((document, index) =>
      initialAttachedDocIds.includes(normalizeVaultDocument(document, index, activeMatter).id),
    );
    const response = await retrieveRag({
      query,
      matter_id: matterId || undefined,
      top_k: 5,
      matter_context: {
        jurisdiction: "District of Columbia",
        attached_document_ids: initialAttachedDocIds,
        attached_documents: selectedDocuments,
        include_vault_documents: Boolean(matterId || initialAttachedDocIds.length),
        include_private_documents: Boolean(matterId || initialAttachedDocIds.length),
        source_policy: "official_dc_sources_first",
        workflow_mode: "dc_research",
      },
    });
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Research failed.");
      return;
    }
    setResult(response.data);
    try {
      await createWorkHistoryClient({
        matterId: matterId || null,
        sourceType: matterId ? "matter" : "research",
        workflowType: "research",
        title: `D.C. research - ${query.trim().slice(0, 90)}`,
        inputSummary: query.trim(),
        requestText: query.trim(),
        outputSummary: `Retrieval returned ${response.data.results.length} source result${response.data.results.length === 1 ? "" : "s"} for attorney review.`,
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
    } catch {
      // History persistence is non-blocking for research results.
    }
  }

  return (
    <div className="p-5 lg:p-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-slate-950">Research</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Run D.C.-focused retrieval with source metadata, matter context when selected, and attorney review before relying on any legal conclusion.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[0.45fr_1fr_auto]">
            <select value={matterId} onChange={(event) => setMatterId(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 text-sm"><option value="">No matter</option>{matters.map((m) => <option key={m.matter_id} value={m.matter_id}>{m.name}</option>)}</select>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What are the D.C. requirements..." className="h-11 rounded-lg border border-slate-300 px-3 text-sm" />
            <button onClick={runResearch} disabled={busy || !query.trim()} className="flex h-11 items-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white">{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Research</button>
          </div>
          {initialDocumentContext ? (
            <div className="mt-4 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] p-3 text-sm text-[#4338CA]">
              Research opened with {initialAttachedDocIds.length} Vault document{initialAttachedDocIds.length === 1 ? "" : "s"} selected. Public D.C. sources remain available; private retrieval is limited to the selected document context and matter scope.
            </div>
          ) : null}
          {initialAttachedDocIds.length && matters.find((matter) => matter.matter_id === matterId)?.documents?.some((document, index) => {
            const normalized = normalizeVaultDocument(document, index, matters.find((matter) => matter.matter_id === matterId));
            return initialAttachedDocIds.includes(normalized.id) && normalized.readiness === "limited";
          }) ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{extractionLimitedWarning}</span>
            </div>
          ) : null}
          {error ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}
          <div className="mt-5 space-y-3">
            {result ? (
              <div className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] p-4">
                <p className="text-sm font-semibold text-slate-950">Retrieval summary</p>
                <p className="mt-1 text-sm text-slate-600">
                  Retrieval completed with review warnings. {result.results.length} source result{result.results.length === 1 ? "" : "s"} returned.
                  Mercy was not invoked on this page; use Mercy Assistant for full reliability review before relying on these results.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <Search className="size-4 text-[#4F46E5]" />
                    Start with a D.C. source question
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Select a matter when available so research can stay connected to facts, documents, and the later Reliability Panel review.
                  </p>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <button type="button" onClick={() => setQuery("What are the D.C. requirements for")} className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50">
                      What are the D.C. requirements for...
                    </button>
                    <button type="button" onClick={() => setQuery("Summarize D.C. Superior Court rule considerations for")} className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50">
                      Summarize D.C. Superior Court rule considerations for...
                    </button>
                    <button type="button" onClick={() => setQuery("Find source support for this matter issue:")} className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50">
                      Find source support for this matter issue...
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <ShieldCheck className="size-4 text-[#4F46E5]" />
                    Research history
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Recent research is saved to History after each completed run. Review returned source metadata before using the output.
                  </p>
                </div>
              </div>
            )}
            {result?.results.map((item) => (
              <div key={item.chunk_id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-950">{item.citation?.label ?? item.source_id}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{safeText(item.summary || item.text, "Summary unavailable. Review the source before use.")}</p>
                <p className="mt-2 text-xs text-slate-500">Source relevance {Math.round(item.combined_score * 100)}%. Attorney review required before use.</p>
              </div>
            ))}
          </div>
        </section>
    </div>
  );
}

export function TemplatesPage({ initialTemplates }: TemplatesPageProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [practiceArea, setPracticeArea] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [popularity, setPopularity] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templates.length) {
      getTemplateGallery().then((response) => {
        if (response.data) setTemplates(response.data.templates);
        if (!response.ok) setError(response.error ?? "Template gallery could not be loaded.");
      });
    }
  }, [templates.length]);

  const practiceAreas = useMemo(
    () => Array.from(new Set(templates.map((template) => template.practice_area))).sort(),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const ranked = [...templates].sort((a, b) => popularityScore(b) - popularityScore(a));
    return ranked.filter((template) => {
      const matchesArea = !practiceArea || template.practice_area === practiceArea;
      const matchesDifficulty = !difficulty || template.difficulty === difficulty;
      const matchesPopularity = popularity === "all" || popularityScore(template) >= Number(popularity);
      const haystack = `${template.title} ${template.description} ${template.practice_area} ${template.required_inputs.join(" ")}`.toLowerCase();
      return matchesArea && matchesDifficulty && matchesPopularity && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
  }, [difficulty, popularity, practiceArea, search, templates]);

  return (
    <div className="p-5 lg:p-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-950">Templates</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Browse D.C.-specific templates, then open the selected workflow directly in Agent X.
              </p>
            </div>
            <span className="w-fit rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#4338CA]">
              {templates.length} templates
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-[1fr_0.5fr_0.45fr_0.45fr]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search motions, retainers, zoning, LLC, discovery..."
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]"
            />
            <select value={practiceArea} onChange={(event) => setPracticeArea(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="">All practice areas</option>
              {practiceAreas.map((area) => (
                <option key={area} value={area}>{area.replace(/_/g, " ")}</option>
              ))}
            </select>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="">All levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            <select value={popularity} onChange={(event) => setPopularity(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">All popularity</option>
              <option value="85">Most used</option>
              <option value="70">Common</option>
            </select>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Popularity is a local product signal derived from workflow breadth, required-input fit, and practice-area priority until live usage analytics are connected.
          </p>

          {error ? <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.map((template) => (
              <div key={template.template_id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold leading-6 text-slate-950">{template.title}</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {popularityScore(template)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{template.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4338CA]">
                    {template.practice_area.replace(/_/g, " ")}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {template.difficulty}
                  </span>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Inputs: {template.required_inputs.slice(0, 4).map((input) => input.replace(/_/g, " ")).join(", ")}
                </p>
                <Link
                  href={`/chat?templateId=${encodeURIComponent(template.template_id)}` as Route}
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#4F46E5] px-4 text-sm font-semibold text-white hover:bg-[#4338CA]"
                >
                  Use Template
                </Link>
              </div>
            ))}
          </div>
        </section>
    </div>
  );
}

export function VaultPage({ matters }: VaultPageProps) {
  const [matterId, setMatterId] = useState(matters[0]?.matter_id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CoreDiscoveryEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const vaultDocuments = useMemo<VaultDocumentView[]>(
    () => matters.flatMap((matter) => (matter.documents ?? []).map((document, index) => normalizeVaultDocument(document, index, matter))),
    [matters],
  );
  const filteredDocuments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return vaultDocuments.filter((document) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "ready" && document.readiness === "searchable") ||
        (filter === "processing" && ["uploading", "extracting"].includes(document.statusKey)) ||
        (filter === "limited" && document.readiness === "limited") ||
        (filter === "matter" && Boolean(document.matterId)) ||
        (filter === "unassigned" && !document.matterId);
      return matchesFilter && (!normalizedSearch || document.searchText.includes(normalizedSearch));
    });
  }, [filter, search, vaultDocuments]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const response = await uploadDiscoveryDocument({ file, matter_id: matterId || undefined });
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Upload failed.");
      return;
    }
    setResult(response.data);
  }

  const factEntries = useMemo(() => safeObjectEntries(result?.facts), [result]);

  return (
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-slate-950">Vault</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Document repository and review layer for uploaded files, matter attachments, and Assistant or Research workflows.
            </p>
          </div>
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <VaultCue icon={FileText} label="Repository" text="Keep uploaded files tied to matter context." />
            <VaultCue icon={Bot} label="Assistant" text="Use documents in drafting, review, or citation checks." />
            <VaultCue icon={ShieldCheck} label="Review" text="Verify source and reliability signals before use." />
          </div>
          <div className="grid gap-3 md:grid-cols-[0.45fr_1fr_auto]">
            <select value={matterId} onChange={(event) => setMatterId(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 text-sm"><option value="">No matter</option>{matters.map((m) => <option key={m.matter_id} value={m.matter_id}>{m.name}</option>)}</select>
            <input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            <button onClick={upload} disabled={busy || !file} className="flex h-11 items-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white">{busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}Upload</button>
          </div>
          {error ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}
          {result ? (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                <span>Document stored. Review extraction details before relying on any document-derived facts.</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <VaultCue icon={FileText} label="Status" text={factEntries.length ? "Ready for review" : "Extraction limited"} />
                <VaultCue icon={Bot} label="Facts" text={`${factEntries.length} clean field${factEntries.length === 1 ? "" : "s"}`} />
                <VaultCue icon={ShieldCheck} label="Review" text="Attorney review required" />
              </div>
              <div className="mt-4 rounded-lg bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-950">Extraction summary</h2>
                {factEntries.length ? (
                  <dl className="mt-3 grid gap-3 md:grid-cols-2">
                    {factEntries.map((entry) => (
                      <div key={entry.label} className="rounded-lg border border-slate-200 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{entry.label}</dt>
                        <dd className="mt-1 text-sm leading-6 text-slate-700">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-slate-600">{extractionLimitedMessage()}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <UploadCloud className="size-4 text-[#4F46E5]" />
                Upload documents into the Vault
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Upload documents, attach them to matters, and use them in Assistant or research workflows. Attorney review remains required.
              </p>
            </div>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Repository</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Uploaded files attached to matters, shown without raw extraction payloads.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {vaultDocuments.length} file{vaultDocuments.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-5 space-y-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search filename, matter, status, upload date, or summary..."
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#C7D2FE]"
            />
            <div className="flex flex-wrap gap-2">
              {[
                ["all", "All"],
                ["ready", "Ready"],
                ["processing", "Processing"],
                ["limited", "Extraction Limited"],
                ["matter", "Matter-linked"],
                ["unassigned", "Unassigned"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    filter === value ? "border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {filteredDocuments.length ? filteredDocuments.map((document) => (
              <article key={document.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-950">{document.filename}</h3>
                    <p className="mt-1 text-xs text-slate-500">{document.type} · {document.matterName}</p>
                  </div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClasses(document.statusKey)}`}>
                    {document.statusLabel}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${document.readiness === "searchable" ? "border-emerald-200 bg-white text-emerald-700" : document.readiness === "limited" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600"}`}>
                    {document.readinessLabel}
                  </span>
                  {document.matterId ? <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">Attached to Matter</span> : null}
                  {document.readiness === "searchable" ? <span className="rounded-full border border-[#C7D2FE] bg-white px-2.5 py-1 text-xs font-medium text-[#4338CA]">Ready for Mercy</span> : null}
                </div>
                {document.readiness === "limited" ? (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{extractionLimitedWarning}</span>
                  </div>
                ) : null}
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <VaultMetric label="Last updated" value={document.lastUpdated} />
                  <VaultMetric label="Size" value={document.sizeLabel} />
                  <VaultMetric label="Pages" value={document.pageCountLabel ?? "Not available"} />
                  <VaultMetric label="Citations" value={document.citationCount} />
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={(document.matterId ? `/matters/${encodeURIComponent(document.matterId)}?tab=documents` : "/matters") as Route}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="size-3.5" />
                    View details
                  </Link>
                  <Link
                    href={`/mercy?${new URLSearchParams({ ...(document.matterId ? { matterId: document.matterId } : {}), attachedDocs: document.id, attached: "1" }).toString()}` as Route}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4338CA]"
                  >
                    <Bot className="size-3.5" />
                    Send to Mercy
                  </Link>
                  <Link
                    href={`/research?${new URLSearchParams({ ...(document.matterId ? { matterId: document.matterId } : {}), attachedDocs: document.id, documentContext: "1" }).toString()}` as Route}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#C7D2FE] bg-white px-3 py-2 text-xs font-semibold text-[#4338CA] hover:bg-[#EEF2FF]"
                  >
                    <Search className="size-3.5" />
                    Use in Research
                  </Link>
                  {document.matterId ? (
                    <Link
                      href={`/matters/${encodeURIComponent(document.matterId)}` as Route}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <FolderOpen className="size-3.5" />
                      Open Matter
                    </Link>
                  ) : null}
                </div>
              </article>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                No Vault documents match this view. Upload a PDF and attach it to a matter to use it in Mercy or research workflows.
              </div>
            )}
          </div>
        </section>
    </div>
  );
}

function VaultMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 truncate font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function VaultCue({ icon: Icon, label, text }: { icon: LucideIcon; label: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
        <Icon className="size-4 text-[#4F46E5]" />
        {label}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function popularityScore(template: CoreTemplateGalleryItem): number {
  const priorityAreas = new Set(["contracts", "civil_litigation", "landlord_tenant", "business", "administrative"]);
  const areaBonus = priorityAreas.has(template.practice_area) ? 18 : 8;
  const difficultyBonus = template.difficulty === "beginner" ? 16 : template.difficulty === "intermediate" ? 12 : 7;
  const inputFit = Math.max(0, 22 - template.required_inputs.length * 2);
  const sourceBonus = template.dc_grounding?.official_sources_only ? 24 : 12;
  return Math.min(99, 30 + areaBonus + difficultyBonus + inputFit + sourceBonus);
}
