"use client";

import { useState } from "react";
import { ArrowUp, Bot, FileText, Loader2, Search, UserRound } from "lucide-react";
import { ReliabilityPanel } from "@/components/dashboard/reliability-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  executeAgent,
  retrieveRag,
  type CoreAgentEnvelope,
  type CoreIntakeSummary,
  type CoreMatterContext,
  type CoreRagEnvelope,
} from "@/lib/core-client";

export type AssistantActionResult =
  | { kind: "research"; result: CoreRagEnvelope }
  | { kind: "agent"; result: CoreAgentEnvelope };

type AiAssistantPanelProps = {
  matterContext?: CoreMatterContext | null;
  intakeSummary?: CoreIntakeSummary | null;
  ragResult?: CoreRagEnvelope | null;
  agentResult?: CoreAgentEnvelope | null;
  onResult: (result: AssistantActionResult) => void;
};

function resultText(agentResult?: CoreAgentEnvelope | null, ragResult?: CoreRagEnvelope | null): string {
  if (agentResult?.agent_result) {
    const draft = agentResult.agent_result.draft;
    const answer = agentResult.agent_result.answer;
    const summary = agentResult.agent_result.summary;
    if (typeof draft === "string") return draft;
    if (typeof answer === "string") return answer;
    if (typeof summary === "string") return summary;
  }
  if (ragResult?.results?.length) {
    return ragResult.results
      .slice(0, 3)
      .map((result) => `${result.summary} Source: ${result.citation?.label ?? result.source_id}.`)
      .join("\n\n");
  }
  return "No live legal output yet. Select or create a matter, then run research or drafting through the Mercy core.";
}

export function AiAssistantPanel({ matterContext, intakeSummary, ragResult, agentResult, onResult }: AiAssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"research" | "agent" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRun = Boolean(matterContext?.matter_id && prompt.trim());
  const activeOutput = resultText(agentResult, ragResult);

  async function runResearch() {
    if (!matterContext?.matter_id || !prompt.trim()) {
      setError("Create or select a matter and enter a research question first.");
      return;
    }
    setBusy("research");
    setError(null);
    const response = await retrieveRag({
      query: prompt,
      matter_id: matterContext.matter_id,
      matter_context: {
        jurisdiction: "District of Columbia",
        matter_type: matterContext.matter_type,
        client_role: matterContext.client_role,
        requested_relief: matterContext.requested_relief,
        key_facts: matterContext.key_facts,
      },
      top_k: 5,
    });
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Research request failed.");
      return;
    }
    onResult({ kind: "research", result: response.data });
  }

  async function runAgent() {
    if (!matterContext?.matter_id || !prompt.trim()) {
      setError("Create or select a matter and enter a drafting or analysis request first.");
      return;
    }
    setBusy("agent");
    setError(null);
    const response = await executeAgent({
      task: prompt,
      matter_id: matterContext.matter_id,
      matter_context: {
        matter_id: matterContext.matter_id,
        jurisdiction: "District of Columbia",
        matter_type: matterContext.matter_type,
        client_role: matterContext.client_role,
        requested_relief: matterContext.requested_relief,
        key_facts: matterContext.key_facts,
        documents: matterContext.documents,
      },
      params: {
        top_k: 4,
        format: "docx",
      },
    });
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Agent request failed.");
      return;
    }
    onResult({ kind: "agent", result: response.data });
  }

  return (
    <Card id="assistant" className="overflow-hidden">
      <CardHeader className="border-b bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>AI Legal Assistant</CardTitle>
            <CardDescription>
              Live D.C. research, drafting, citation, and compliance actions routed through the shared core.
            </CardDescription>
          </div>
          <Badge variant={matterContext ? "gold" : "risk"}>{matterContext ? "Matter linked" : "Matter required"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 bg-[#fbfcfe] p-5">
        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mercy-navy text-white">
                <UserRound className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-mercy-navy">
                  {matterContext?.name ?? "No active matter selected"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {matterContext
                    ? `${matterContext.jurisdiction ?? "Jurisdiction pending"} / ${matterContext.client_role ?? "role pending"} / ${matterContext.requested_relief ?? "relief pending"}`
                    : "Create a tenant-scoped matter before running legal work."}
                </p>
                {intakeSummary && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Intake: {intakeSummary.conflict_status.replace(/_/g, " ")} conflict status,{" "}
                    {intakeSummary.scope_status.replace(/_/g, " ")} scope status.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-mercy-navy">
              <Bot className="size-4 text-[#9b740e]" />
              Live output
            </div>
            <pre className="mt-3 max-h-72 whitespace-pre-wrap rounded-md bg-secondary/70 p-3 text-xs leading-5 text-[#34405a]">
              {activeOutput}
            </pre>
          </div>
        </div>

        <ReliabilityPanel
          envelope={agentResult?.response_envelope ?? ragResult?.response_envelope}
          route={agentResult?.route ?? ragResult?.route}
          rag={ragResult}
          agent={agentResult}
        />

        {error && (
          <div className="rounded-md border border-[#ead08a] bg-[#fff8e1] p-3 text-xs text-[#735b13]">{error}</div>
        )}

        <div className="rounded-lg border bg-white p-3">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask a D.C. research question, draft a clause, analyze risk, or verify a citation..."
            className="min-h-24 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Output requires attorney review. Low-confidence or missing-source responses are intentionally bounded.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!canRun || busy !== null} onClick={runResearch}>
                {busy === "research" ? <Loader2 className="animate-spin" /> : <Search />}
                Research
              </Button>
              <Button variant="gold" size="sm" disabled={!canRun || busy !== null} onClick={runAgent}>
                {busy === "agent" ? <Loader2 className="animate-spin" /> : <FileText />}
                Draft / analyze
                <ArrowUp />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
