import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import { matters } from "@/lib/data";
import type { CoreIntakeSummary, CoreMatter } from "@/lib/core-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MatterManagementProps = {
  coreMatters?: CoreMatter[];
  coreOnline?: boolean;
  currentMatter?: CoreMatter | null;
  intakeSummary?: CoreIntakeSummary | null;
  demoOnly?: boolean;
};

export function MatterManagement({
  coreMatters = [],
  coreOnline = false,
  currentMatter,
  intakeSummary,
  demoOnly = false,
}: MatterManagementProps) {
  const hasLiveMatters = coreOnline && coreMatters.length > 0;
  const displayedMatters = hasLiveMatters
    ? coreMatters.map((matter) => ({
        id: matter.matter_id,
        client: matter.client_name ?? matter.name,
        matter: `${matter.name} / ${matter.jurisdiction ?? "jurisdiction pending"}`,
        status: "Live core",
        next: `${Object.keys(matter.key_facts ?? matter.facts ?? {}).length} key facts, ${
          matter.documents?.length ?? 0
        } documents, ${matter.missing_information?.length ?? 0} open intake items`,
      }))
    : matters.map((matter) => ({ ...matter, id: matter.client }));

  return (
    <Card id="matters">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Matter Management</CardTitle>
            <CardDescription>Simple client and matter tracking connected to the AI workspace.</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            View all
            <ArrowRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {currentMatter && (
          <div className="rounded-md border border-[#d9c27a] bg-[#fffaf0] p-4 text-sm text-mercy-navy">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Current context: {currentMatter.name}</p>
              {demoOnly && <Badge variant="outline">Demo-only</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {currentMatter.client_name ?? currentMatter.client_id} / {currentMatter.client_role ?? "role pending"} /{" "}
              {currentMatter.requested_relief ?? "requested relief pending"}
            </p>
            {demoOnly && (
              <p className="mt-2 text-xs text-muted-foreground">
                Local sample context only. Dashboard render did not create or update a core matter.
              </p>
            )}
            {intakeSummary && (
              <p className="mt-2 text-xs text-muted-foreground">
                Intake: conflict {intakeSummary.conflict_status.replace(/_/g, " ")}, scope{" "}
                {intakeSummary.scope_status.replace(/_/g, " ")}, {intakeSummary.missing_information_count} open item
                {intakeSummary.missing_information_count === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        )}
        {displayedMatters.map((matter) => (
          <div key={matter.id} className="grid gap-4 rounded-md border bg-white p-4 md:grid-cols-[1fr_0.8fr_auto] md:items-center">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-mercy-navy">
                <BriefcaseBusiness className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-mercy-navy">{matter.client}</p>
                <p className="mt-1 text-xs text-muted-foreground">{matter.matter}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{matter.next}</p>
            <Badge variant="secondary">{matter.status}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
