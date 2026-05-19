"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, FileText, Loader2, Search, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  createMatter,
  getTemplateGallery,
  retrieveRag,
  submitFullMatterIntake,
  uploadDiscoveryDocument,
  type CoreDiscoveryEnvelope,
  type CoreMatter,
  type CoreRagEnvelope,
  type CoreTemplateGalleryItem,
} from "@/lib/core-client";

type MattersPageProps = { matters: CoreMatter[]; coreOnline: boolean };
type TemplatesPageProps = { initialTemplates: CoreTemplateGalleryItem[] };
type ResearchPageProps = { matters: CoreMatter[] };
type IntakePageProps = { matters: CoreMatter[] };
type VaultPageProps = { matters: CoreMatter[] };

export function MattersPage({ matters, coreOnline }: MattersPageProps) {
  const [items, setItems] = useState(matters);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [matterType, setMatterType] = useState("contract review");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await createMatter({ name, client_name: clientName, matter_type: matterType, tier: "free" });
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Matter creation failed.");
      return;
    }
    setItems((current) => [response.data!, ...current]);
    setName("");
    setClientName("");
  }

  return (
    <>
      <PageHeader title="Matters" description="Create and select tenant-scoped D.C. matters for Agent X workflows.">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
          Core {coreOnline ? "online" : "unavailable"}
        </span>
      </PageHeader>
      <div className="grid gap-5 p-5 lg:grid-cols-[380px_minmax(0,1fr)] lg:p-8">
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">New matter</h2>
          <div className="mt-4 space-y-3">
            <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Matter name" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Client name" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            <input value={matterType} onChange={(event) => setMatterType(event.target.value)} placeholder="Matter type" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            {error ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{error}</p> : null}
            <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#4F46E5] text-sm font-semibold text-white">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <BriefcaseBusiness className="size-4" />}
              Create matter
            </button>
          </div>
        </form>
        <section className="space-y-3">
          {items.length ? items.map((matter) => (
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
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No matters returned.</div>
          )}
        </section>
      </div>
    </>
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
    <>
      <PageHeader title="Intake" description="Capture the minimum matter facts Agent X needs before research, drafting, or document review." />
      <div className="p-5 lg:p-8">
        <form onSubmit={submit} className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
    </>
  );
}

export function ResearchPage({ matters }: ResearchPageProps) {
  const [matterId, setMatterId] = useState(matters[0]?.matter_id ?? "");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CoreRagEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runResearch() {
    setBusy(true);
    setError(null);
    const response = await retrieveRag({ query, matter_id: matterId || undefined, top_k: 5, matter_context: { jurisdiction: "District of Columbia" } });
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Research failed.");
      return;
    }
    setResult(response.data);
  }

  return (
    <>
      <PageHeader title="Research" description="Run D.C.-focused retrieval with official-source metadata and citation summaries." />
      <div className="p-5 lg:p-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[0.45fr_1fr_auto]">
            <select value={matterId} onChange={(event) => setMatterId(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 text-sm"><option value="">No matter</option>{matters.map((m) => <option key={m.matter_id} value={m.matter_id}>{m.name}</option>)}</select>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What are the D.C. requirements..." className="h-11 rounded-lg border border-slate-300 px-3 text-sm" />
            <button onClick={runResearch} disabled={busy || !query.trim()} className="flex h-11 items-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white">{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Research</button>
          </div>
          {error ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}
          <div className="mt-5 space-y-3">
            {result ? (
              <div className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] p-4">
                <p className="text-sm font-semibold text-slate-950">Retrieval summary</p>
                <p className="mt-1 text-sm text-slate-600">
                  {result.results.length} result(s), verification status {result.verification.status}, guardrails {result.guardrail_status}.
                  Agent X was not invoked on this page; use Ask Agent X for full Hermes-powered MoE reliability.
                </p>
              </div>
            ) : null}
            {result?.results.map((item) => (
              <div key={item.chunk_id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-950">{item.citation?.label ?? item.source_id}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary || item.text}</p>
                <p className="mt-2 text-xs text-slate-500">Score {Math.round(item.combined_score * 100)} / {item.verification_status}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
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
    <>
      <PageHeader
        title="Templates"
        description="Browse 26 D.C.-specific templates, then open the selected workflow directly in Ask Agent X."
      >
        <span className="rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#4338CA]">
          {templates.length} templates
        </span>
      </PageHeader>
      <div className="p-5 lg:p-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
    </>
  );
}

export function VaultPage({ matters }: VaultPageProps) {
  const [matterId, setMatterId] = useState(matters[0]?.matter_id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CoreDiscoveryEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const facts = useMemo(() => result?.facts ? JSON.stringify(result.facts, null, 2) : "Upload a PDF to run discovery/document analysis.", [result]);

  return (
    <>
      <PageHeader title="Vault" description="Upload approved test documents for discovery analysis. Production document-vault retention remains a beta gate." />
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[0.45fr_1fr_auto]">
            <select value={matterId} onChange={(event) => setMatterId(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 text-sm"><option value="">No matter</option>{matters.map((m) => <option key={m.matter_id} value={m.matter_id}>{m.name}</option>)}</select>
            <input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            <button onClick={upload} disabled={busy || !file} className="flex h-11 items-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white">{busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}Upload</button>
          </div>
          {error ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}
          <pre className="mt-5 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{facts}</pre>
        </section>
      </div>
    </>
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
