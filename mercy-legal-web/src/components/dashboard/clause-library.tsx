"use client";

import { useState } from "react";
import { Copy, Loader2, Search, WandSparkles } from "lucide-react";
import { ReliabilityPanel } from "@/components/dashboard/reliability-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { executeAgent, retrieveRag, type CoreMatterContext } from "@/lib/core-client";
import type { AssistantActionResult } from "@/components/dashboard/ai-assistant-panel";

type ClauseLibraryProps = {
  matterContext?: CoreMatterContext | null;
  onResult: (result: AssistantActionResult) => void;
};

export function ClauseLibrary({ matterContext, onResult }: ClauseLibraryProps) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"search" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AssistantActionResult | null>(null);

  async function searchClauses() {
    if (!matterContext?.matter_id || !query.trim()) {
      setError("Select a matter and enter clause terms before searching.");
      return;
    }
    setBusy("search");
    setError(null);
    const response = await retrieveRag({
      query: `Find D.C. clause guidance for: ${query}`,
      matter_id: matterContext.matter_id,
      matter_context: {
        jurisdiction: "District of Columbia",
        practice_area: "contracts",
        matter_type: matterContext.matter_type,
      },
      top_k: 5,
    });
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Clause source search failed.");
      return;
    }
    const result = { kind: "research" as const, result: response.data };
    setLastResult(result);
    onResult(result);
  }

  async function draftClause() {
    if (!matterContext?.matter_id || !query.trim()) {
      setError("Select a matter and enter clause terms before drafting.");
      return;
    }
    setBusy("draft");
    setError(null);
    const response = await executeAgent({
      task: `Draft or revise D.C. contract clause language for attorney review: ${query}`,
      matter_id: matterContext.matter_id,
      matter_context: {
        matter_id: matterContext.matter_id,
        jurisdiction: "District of Columbia",
        matter_type: matterContext.matter_type,
        key_facts: matterContext.key_facts,
      },
      params: {
        top_k: 4,
        format: "docx",
      },
    });
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Clause drafting failed.");
      return;
    }
    const result = { kind: "agent" as const, result: response.data };
    setLastResult(result);
    onResult(result);
  }

  const researchResults = lastResult?.kind === "research" ? lastResult.result.results : [];
  const agentDraft = lastResult?.kind === "agent" && typeof lastResult.result.agent_result?.draft === "string"
    ? lastResult.result.agent_result.draft
    : null;

  return (
    <Card id="clause-library">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>D.C. Clause Workbench</CardTitle>
            <CardDescription>Search live D.C. source grounding or draft clause language through the agent network.</CardDescription>
          </div>
          <Badge variant={matterContext ? "gold" : "risk"}>{matterContext ? "Matter linked" : "Matter required"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {error && <div className="mb-3 rounded-md border border-[#ead08a] bg-[#fff8e1] p-3 text-xs text-[#735b13]">{error}</div>}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            placeholder="Venue, indemnity, limitation of liability, payment, confidentiality..."
          />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-2">
            {researchResults.length ? (
              researchResults.slice(0, 5).map((result) => (
                <div key={result.chunk_id} className="rounded-md border bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-mercy-navy">{result.citation?.label ?? result.source_id}</p>
                    <Badge variant={result.verification_status.includes("official") ? "secondary" : "gold"}>
                      {result.verification_status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{result.summary}</p>
                </div>
              ))
            ) : (
              <div className="rounded-md border bg-white p-4 text-sm text-muted-foreground">
                No live clause sources loaded. Search D.C. sources to populate this panel.
              </div>
            )}
          </div>
          <div className="rounded-lg border bg-[#fbfcfe] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-mercy-navy">
              <WandSparkles className="size-4 text-[#b48b13]" />
              Agent drafting result
            </div>
            <pre className="mt-5 max-h-72 whitespace-pre-wrap rounded-md border bg-white p-4 text-xs leading-6 text-[#34405a]">
              {agentDraft ?? "Drafted clause language will appear here only after a live agent response."}
            </pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!matterContext || !query.trim() || busy !== null} onClick={searchClauses}>
                {busy === "search" ? <Loader2 className="animate-spin" /> : <Search />}
                Search sources
              </Button>
              <Button variant="gold" size="sm" disabled={!matterContext || !query.trim() || busy !== null} onClick={draftClause}>
                {busy === "draft" ? <Loader2 className="animate-spin" /> : <Copy />}
                Draft clause
              </Button>
            </div>
          </div>
        </div>
        {lastResult && (
          <div className="mt-4">
            <ReliabilityPanel
              title="Clause reliability"
              rag={lastResult.kind === "research" ? lastResult.result : null}
              agent={lastResult.kind === "agent" ? lastResult.result : null}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
