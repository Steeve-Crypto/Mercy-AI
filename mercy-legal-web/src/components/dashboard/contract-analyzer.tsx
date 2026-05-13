"use client";

import { AlertTriangle, FileSearch, ShieldCheck } from "lucide-react";
import { ReliabilityPanel } from "@/components/dashboard/reliability-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { CoreAgentEnvelope, CoreDiscoveryEnvelope, CoreMatterContext } from "@/lib/core-client";

type ContractAnalyzerProps = {
  matterContext?: CoreMatterContext | null;
  agentResult?: CoreAgentEnvelope | null;
  discoveryResult?: CoreDiscoveryEnvelope | null;
};

function riskScore(agentResult?: CoreAgentEnvelope | null, discoveryResult?: CoreDiscoveryEnvelope | null): number {
  const status = agentResult?.guardrail_status ?? discoveryResult?.guardrail_status;
  if (status === "block") return 90;
  if (status === "warn") return 64;
  if (status === "pass") return 24;
  return 0;
}

export function ContractAnalyzer({ matterContext, agentResult, discoveryResult }: ContractAnalyzerProps) {
  const score = riskScore(agentResult, discoveryResult);
  const flags = agentResult?.response_envelope.dc_ethics_metadata.review_flags ?? discoveryResult?.response_envelope.dc_ethics_metadata.review_flags ?? [];
  const latestResult = agentResult ?? discoveryResult ?? null;

  return (
    <Card id="contract-analyzer">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Live Analysis</CardTitle>
            <CardDescription>Guardrail status, risk signals, and latest core analysis for the selected matter.</CardDescription>
          </div>
          <Badge variant={score >= 75 ? "risk" : score > 0 ? "gold" : "outline"}>{score ? `Risk ${score}` : "No run"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-mercy-navy p-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-white/10">
                {latestResult ? <ShieldCheck className="size-5 text-[#f0d46a]" /> : <FileSearch className="size-5 text-[#f0d46a]" />}
              </div>
              <div>
                <p className="text-sm font-medium">{latestResult ? "Latest core analysis" : "Awaiting live action"}</p>
                <p className="mt-1 text-xs text-white/58">{matterContext?.name ?? "Create or select a matter first"}</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-[#f0d46a]">{score ? `${score}%` : "--"}</span>
          </div>
          <Progress value={score} className="mt-5 bg-white/12" />
        </div>

        <div className="mt-5 space-y-3">
          {flags.length ? (
            flags.map((flag) => (
              <div key={flag} className="rounded-md border bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="size-4 text-[#b48b13]" />
                    <p className="text-sm font-medium text-mercy-navy">{flag.replace(/\./g, " / ").replace(/_/g, " ")}</p>
                  </div>
                  <Badge variant="gold">Review</Badge>
                </div>
                <Progress value={64} className="mt-3 h-1.5" />
              </div>
            ))
          ) : (
            <div className="rounded-md border bg-white p-4 text-sm text-muted-foreground">
              Run a research, drafting, or upload action to populate live risk signals. Mercy will not invent analysis without a core response.
            </div>
          )}
        </div>

        {agentResult && (
          <div className="mt-5">
            <ReliabilityPanel title="Agent reliability" agent={agentResult} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
