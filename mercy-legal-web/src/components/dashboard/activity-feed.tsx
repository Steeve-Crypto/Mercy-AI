"use client";

import { Archive, BriefcaseBusiness, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardEvent } from "@/components/dashboard/dashboard-workspace";
import type { CoreAgentEnvelope, CoreDiscoveryEnvelope, CoreMatter, CoreRagEnvelope } from "@/lib/core-client";

type ActivityFeedProps = {
  events: DashboardEvent[];
  matters: CoreMatter[];
  ragResult?: CoreRagEnvelope | null;
  agentResult?: CoreAgentEnvelope | null;
  discoveryResult?: CoreDiscoveryEnvelope | null;
};

function iconFor(event: DashboardEvent) {
  if (event.label.toLowerCase().includes("research")) return Search;
  if (event.label.toLowerCase().includes("document")) return Archive;
  if (event.label.toLowerCase().includes("matter")) return BriefcaseBusiness;
  if (event.status === "block" || event.status === "warn") return ShieldCheck;
  return Sparkles;
}

export function ActivityFeed({ events, matters, ragResult, agentResult, discoveryResult }: ActivityFeedProps) {
  const synthesizedEvents: DashboardEvent[] = events.length
    ? events
    : [
        {
          id: "initial-state",
          label: matters.length ? "Tenant matters loaded" : "Ready for first matter",
          detail: matters.length
            ? `${matters.length} matter${matters.length === 1 ? "" : "s"} returned from the shared core.`
            : "Create a matter to begin live intake, research, and drafting.",
          status: matters.length ? "pass" : "info",
          time: "Now",
        },
      ];

  return (
    <Card id="activity">
      <CardHeader>
        <CardTitle>Live Activity</CardTitle>
        <CardDescription>Core actions from this dashboard session.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between rounded-md bg-secondary/70 p-2">
            <span>Latest RAG status</span>
            <Badge variant={ragResult?.verification.status === "pass" ? "secondary" : ragResult ? "gold" : "outline"}>
              {ragResult?.verification.status ?? "pending"}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-md bg-secondary/70 p-2">
            <span>Latest agent</span>
            <Badge variant={agentResult?.guardrail_status === "block" ? "risk" : agentResult ? "secondary" : "outline"}>
              {agentResult?.selected_agent ?? "pending"}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-md bg-secondary/70 p-2">
            <span>Latest upload</span>
            <Badge variant={discoveryResult ? "secondary" : "outline"}>{discoveryResult?.engine ?? "pending"}</Badge>
          </div>
        </div>

        {synthesizedEvents.map((item) => {
          const Icon = iconFor(item);
          return (
            <div key={item.id} className="flex gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1 border-b pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-mercy-navy">{item.label}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
