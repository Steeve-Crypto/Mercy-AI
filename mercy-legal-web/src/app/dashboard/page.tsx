import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AiAssistantPanel } from "@/components/dashboard/ai-assistant-panel";
import { ClauseLibrary } from "@/components/dashboard/clause-library";
import { ContractAnalyzer } from "@/components/dashboard/contract-analyzer";
import { DocumentVault } from "@/components/dashboard/document-vault";
import { MatterManagement } from "@/components/dashboard/matter-management";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dashboardStats } from "@/lib/data";
import { Bell, CalendarDays, Plus, Search, Sparkles } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="px-5 py-5 lg:px-8">
      <header className="sticky top-0 z-20 -mx-5 mb-6 border-b bg-[#f4f6fa]/88 px-5 py-4 backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="gold">DC practice workspace</Badge>
              <span className="text-xs text-muted-foreground">Tuesday, April 28</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-mercy-navy">
              Good afternoon, Counsel
            </h1>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm text-muted-foreground shadow-sm sm:w-72">
              <Search className="size-4" />
              Search matters, clauses, documents
            </div>
            <Button variant="outline" size="icon" aria-label="Calendar">
              <CalendarDays />
            </Button>
            <Button variant="outline" size="icon" aria-label="Notifications">
              <Bell />
            </Button>
            <Button variant="gold">
              <Plus />
              New matter
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => (
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
        <AiAssistantPanel />
        <ContractAnalyzer />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DocumentVault />
        <ClauseLibrary />
      </section>

      <section className="mt-5 grid gap-5 pb-8 xl:grid-cols-[1fr_0.8fr]">
        <MatterManagement />
        <ActivityFeed />
      </section>
    </div>
  );
}
