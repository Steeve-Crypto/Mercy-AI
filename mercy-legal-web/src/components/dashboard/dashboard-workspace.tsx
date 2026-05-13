"use client";

import { useMemo, useState } from "react";
import { Bell, CalendarDays, Plus, Search, ShieldCheck, Sparkles } from "lucide-react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AiAssistantPanel, type AssistantActionResult } from "@/components/dashboard/ai-assistant-panel";
import { ClauseLibrary } from "@/components/dashboard/clause-library";
import { ContractAnalyzer } from "@/components/dashboard/contract-analyzer";
import { DocumentVault } from "@/components/dashboard/document-vault";
import { MatterManagement } from "@/components/dashboard/matter-management";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  CoreAgentEnvelope,
  CoreDiscoveryEnvelope,
  CoreFullMatterIntakeEnvelope,
  CoreMatter,
  CoreRagEnvelope,
  CoreSnapshot,
} from "@/lib/core-client";

type DashboardWorkspaceProps = {
  initialSnapshot: CoreSnapshot;
};

export type DashboardEvent = {
  id: string;
  label: string;
  detail: string;
  time: string;
  status: "pass" | "warn" | "block" | "info";
};

function eventNow(label: string, detail: string, status: DashboardEvent["status"] = "info"): DashboardEvent {
  return {
    id: crypto.randomUUID(),
    label,
    detail,
    status,
    time: "Just now",
  };
}

export function DashboardWorkspace({ initialSnapshot }: DashboardWorkspaceProps) {
  const [matters, setMatters] = useState<CoreMatter[]>(initialSnapshot.matters);
  const [selectedMatterId, setSelectedMatterId] = useState(initialSnapshot.matters[0]?.matter_id ?? "");
  const [intake, setIntake] = useState<CoreFullMatterIntakeEnvelope | null>(null);
  const [ragResult, setRagResult] = useState<CoreRagEnvelope | null>(null);
  const [agentResult, setAgentResult] = useState<CoreAgentEnvelope | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<CoreDiscoveryEnvelope | null>(null);
  const [events, setEvents] = useState<DashboardEvent[]>([]);

  const selectedMatter = useMemo(
    () => matters.find((matter) => matter.matter_id === selectedMatterId) ?? matters[0] ?? intake?.matter_context ?? null,
    [intake?.matter_context, matters, selectedMatterId],
  );

  const liveStats = [
    { label: "Tenant matters", value: String(matters.length), icon: ShieldCheck },
    {
      label: "Open intake items",
      value: String(matters.reduce((total, matter) => total + (matter.missing_information?.length ?? 0), 0)),
      icon: CalendarDays,
    },
    {
      label: "Grounded sources",
      value: String(ragResult?.results?.length ?? 0),
      icon: Search,
    },
    {
      label: "Agent skills used",
      value: String(agentResult?.mcp_skills_used?.length ?? 0),
      icon: Sparkles,
    },
  ];

  function addEvent(event: DashboardEvent) {
    setEvents((current) => [event, ...current].slice(0, 12));
  }

  function upsertMatter(matter: CoreMatter) {
    setMatters((current) => {
      const exists = current.some((item) => item.matter_id === matter.matter_id);
      return exists ? current.map((item) => (item.matter_id === matter.matter_id ? matter : item)) : [matter, ...current];
    });
    setSelectedMatterId(matter.matter_id);
  }

  function handleMatterCreated(matter: CoreMatter) {
    upsertMatter(matter);
    addEvent(eventNow("Matter created", `${matter.name} is available for intake and live workflows.`, "pass"));
  }

  function handleIntakeComplete(result: CoreFullMatterIntakeEnvelope) {
    setIntake(result);
    upsertMatter(result.matter_context);
    addEvent(eventNow("Client intake saved", `${result.intake_summary.missing_information_count} open intake item(s).`, "pass"));
  }

  function handleAssistantResult(result: AssistantActionResult) {
    if (result.kind === "research") {
      setRagResult(result.result);
      addEvent(eventNow("Research completed", `${result.result.results.length} D.C. source result(s) returned.`, result.result.verification.status === "pass" ? "pass" : "warn"));
    } else {
      setAgentResult(result.result);
      addEvent(eventNow("Agent action completed", `${result.result.selected_agent} used ${result.result.mcp_skills_used?.length ?? 0} skill(s).`, result.result.guardrail_status === "block" ? "block" : "pass"));
    }
  }

  function handleDiscovery(result: CoreDiscoveryEnvelope) {
    setDiscoveryResult(result);
    addEvent(eventNow("Document analyzed", `${result.engine} returned facts and citation placeholders.`, result.guardrail_status === "block" ? "block" : "pass"));
  }

  const currentMatter = selectedMatter ?? intake?.matter_context ?? null;
  const currentIntakeSummary = intake?.intake_summary ?? null;

  return (
    <div className="px-5 py-5 lg:px-8">
      <header className="sticky top-0 z-20 -mx-5 mb-6 border-b bg-[#f4f6fa]/88 px-5 py-4 backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="gold">D.C. practice workspace</Badge>
              <Badge variant={initialSnapshot.online ? "secondary" : "risk"}>
                Core {initialSnapshot.online ? "online" : "unavailable"}
              </Badge>
              <Badge variant="outline">{initialSnapshot.capabilities?.security_posture.mode ?? "auth required"}</Badge>
              <Badge variant="secondary">Tenant isolated</Badge>
              <Badge variant={ragResult?.results?.length ? "secondary" : "gold"}>
                {ragResult?.results?.length ? "Official D.C. grounding active" : "D.C. grounding pending"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {initialSnapshot.health?.clerk_os_version ?? "FastAPI core unreachable"} | {initialSnapshot.coreUrl}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-mercy-navy">
              Matter command center
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Live intake, research, drafting, and document analysis for D.C. matters. Every action is routed through the shared core and marked for attorney review.
            </p>
            {initialSnapshot.error && (
              <p className="mt-2 text-xs text-[#8a6110]">
                Core service temporarily unavailable - working in offline review mode. {initialSnapshot.error}. Retry before relying on legal output.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm text-muted-foreground shadow-sm sm:w-72">
              <Search className="size-4" />
              {currentMatter ? currentMatter.name : "Create or select a matter"}
            </div>
            <Button variant="outline" size="icon" aria-label="Calendar">
              <CalendarDays />
            </Button>
            <Button variant="outline" size="icon" aria-label="Notifications">
              <Bell />
            </Button>
            <Button variant="gold" asChild>
              <a href="#matters">
                <Plus />
                New matter
              </a>
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {liveStats.map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-white p-5 shadow-[0_16px_45px_rgba(10,20,40,0.05)]">
            <div className="flex items-center justify-between">
              <div className="flex size-10 items-center justify-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
                <stat.icon className="size-5" />
              </div>
              <Sparkles className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-5 text-3xl font-semibold text-mercy-navy">{stat.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <AiAssistantPanel
          matterContext={currentMatter}
          intakeSummary={currentIntakeSummary}
          ragResult={ragResult}
          agentResult={agentResult}
          onResult={handleAssistantResult}
        />
        <ContractAnalyzer matterContext={currentMatter} agentResult={agentResult} discoveryResult={discoveryResult} />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DocumentVault matterContext={currentMatter} discoveryResult={discoveryResult} onDiscovery={handleDiscovery} />
        <ClauseLibrary matterContext={currentMatter} onResult={handleAssistantResult} />
      </section>

      <section className="mt-5 grid gap-5 pb-8 xl:grid-cols-[1fr_0.8fr]">
        <MatterManagement
          coreMatters={matters}
          coreOnline={initialSnapshot.online}
          currentMatter={currentMatter}
          selectedMatterId={selectedMatterId}
          intakeSummary={currentIntakeSummary}
          onSelectMatter={setSelectedMatterId}
          onMatterCreated={handleMatterCreated}
          onIntakeComplete={handleIntakeComplete}
        />
        <ActivityFeed events={events} matters={matters} ragResult={ragResult} agentResult={agentResult} discoveryResult={discoveryResult} />
      </section>
    </div>
  );
}
