"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Filter, Loader2, Search, WandSparkles } from "lucide-react";
import { ReliabilityPanel } from "@/components/dashboard/reliability-panel";
import { BetaFeedback } from "@/components/dashboard/beta-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createMatter,
  executeAgent,
  getTemplateGallery,
  type CoreAgentEnvelope,
  type CoreMatter,
  type CoreMatterContext,
  type CoreTemplateGalleryItem,
} from "@/lib/core-client";
import type { AssistantActionResult } from "@/components/dashboard/ai-assistant-panel";

type TemplateGalleryProps = {
  matterContext?: CoreMatterContext | null;
  onMatterCreated: (matter: CoreMatter) => void;
  onResult: (result: AssistantActionResult) => void;
};

function outputText(result?: CoreAgentEnvelope | null): string {
  const agent = result?.agent_result;
  const draft = agent?.draft;
  const answer = agent?.answer;
  if (typeof draft === "string") return draft;
  if (typeof answer === "string") return answer;
  return "Select a template to generate live attorney-review work product.";
}

export function TemplateGallery({ matterContext, onMatterCreated, onResult }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<CoreTemplateGalleryItem[]>([]);
  const [practiceArea, setPracticeArea] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [search, setSearch] = useState("");
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CoreAgentEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getTemplateGallery().then((response) => {
      if (!mounted) return;
      if (response.ok && response.data) {
        setTemplates(response.data.templates);
      } else {
        setError(response.error ?? "Template gallery could not be loaded.");
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredTemplates = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return templates.filter((template) => {
      const areaMatch = !practiceArea || template.practice_area === practiceArea;
      const difficultyMatch = !difficulty || template.difficulty === difficulty;
      const haystack = `${template.title} ${template.description} ${template.practice_area}`.toLowerCase();
      const searchMatch = !normalized || haystack.includes(normalized);
      return areaMatch && difficultyMatch && searchMatch;
    });
  }, [difficulty, practiceArea, search, templates]);

  const practiceAreas = useMemo(() => Array.from(new Set(templates.map((template) => template.practice_area))).sort(), [templates]);

  async function ensureMatter(template: CoreTemplateGalleryItem): Promise<CoreMatter | CoreMatterContext | null> {
    if (matterContext?.matter_id) {
      return matterContext;
    }
    const response = await createMatter({
      name: `${template.title} matter`,
      client_name: "New D.C. client",
      matter_type: template.matter_type,
      tier: "free",
    });
    if (!response.ok || !response.data) {
      setError(response.error ?? "Quick matter creation failed.");
      return null;
    }
    onMatterCreated(response.data);
    return response.data;
  }

  async function generate(template: CoreTemplateGalleryItem) {
    setBusyTemplateId(template.template_id);
    setError(null);
    setNotice("Creating a tenant-scoped generation request with official D.C. grounding and attorney-review metadata.");
    const matter = await ensureMatter(template);
    if (!matter?.matter_id) {
      setBusyTemplateId(null);
      setNotice(null);
      return;
    }
    const response = await executeAgent({
      task: template.generation_task,
      matter_id: matter.matter_id,
      matter_context: {
        matter_id: matter.matter_id,
        jurisdiction: "District of Columbia",
        matter_type: template.matter_type,
        practice_area: template.practice_area,
        requested_relief: template.generation_task,
        key_facts: {
          template_id: template.template_id,
          required_inputs: template.required_inputs,
          ...(template.default_inputs ?? {}),
        },
      },
      params: {
        template_id: template.template_id,
        prompt_template_id: template.prompt_template_id,
        template_title: template.title,
        required_inputs: template.required_inputs,
        source_query: template.source_query,
        top_k: 5,
        format: "docx",
      },
    });
    setBusyTemplateId(null);
    if (!response.ok || !response.data) {
      setNotice(null);
      setError(response.error ?? "Template generation failed.");
      return;
    }
    setLastResult(response.data);
    setNotice("Generated with live Mercy core. Attorney must verify facts, citations, source text, and final wording.");
    onResult({ kind: "agent", result: response.data });
  }

  return (
    <Card id="template-gallery">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>D.C. Template Gallery</CardTitle>
            <CardDescription>
              Practical templates powered by the PD039 prompt registry and seeded official D.C. knowledge base.
            </CardDescription>
          </div>
          <Badge variant="gold">{templates.length || 25}+ templates</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_0.45fr_0.45fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search motions, retainers, zoning, LLC, discovery..." />
          </div>
          <select value={practiceArea} onChange={(event) => setPracticeArea(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm">
            <option value="">All practice areas</option>
            {practiceAreas.map((area) => (
              <option key={area} value={area}>
                {area.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm">
            <option value="">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        {error && <div className="rounded-md border border-[#ead08a] bg-[#fff8e1] p-3 text-xs text-[#735b13]">{error}</div>}
        {notice && !error && <div className="rounded-md border border-[#d7e7d0] bg-[#f2fbef] p-3 text-xs text-[#285b2f]">{notice}</div>}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((template) => (
            <div key={template.template_id} className="flex min-h-72 flex-col rounded-lg border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-mercy-navy">
                  <FileText className="size-4" />
                </div>
                <Badge variant={template.difficulty === "advanced" ? "gold" : "secondary"}>{template.difficulty}</Badge>
              </div>
              <h3 className="mt-3 text-base font-semibold leading-6 text-mercy-navy">{template.title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{template.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                <Badge variant="outline">{template.practice_area.replace(/_/g, " ")}</Badge>
                <Badge variant="secondary">Official D.C. sources</Badge>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                <div className="mb-1 flex items-center gap-1 font-semibold text-mercy-navy">
                  <Filter className="size-3" />
                  Inputs
                </div>
                {template.required_inputs.slice(0, 4).map((input) => input.replace(/_/g, " ")).join(", ")}
              </div>
              <p className="mt-auto pt-3 text-xs leading-5 text-muted-foreground">{template.ethics_tip}</p>
              <Button className="mt-3" variant="gold" size="sm" onClick={() => generate(template)} disabled={busyTemplateId !== null}>
                {busyTemplateId === template.template_id ? <Loader2 className="animate-spin" /> : <WandSparkles />}
                Generate with current matter
              </Button>
            </div>
          ))}
        </div>

        {lastResult && (
          <div>
            <pre className="max-h-72 whitespace-pre-wrap rounded-md border bg-white p-4 text-xs leading-6 text-[#34405a]">
              {outputText(lastResult)}
            </pre>
            <div className="mt-4">
              <ReliabilityPanel title="Template generation reliability" agent={lastResult} />
            </div>
            <div className="mt-4">
              <BetaFeedback
                action="template_generation"
                traceId={lastResult.trace_id}
                routeExpert={lastResult.selected_expert}
                guardrailStatus={lastResult.guardrail_status}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
