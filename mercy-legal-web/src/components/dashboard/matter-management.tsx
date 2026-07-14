"use client";

import { FormEvent, useState } from "react";
import { BriefcaseBusiness, Loader2, Save, UserPlus } from "lucide-react";
import { createMatter, submitFullMatterIntake, type CoreFullMatterIntakeEnvelope, type CoreIntakeSummary, type CoreMatter } from "@/lib/core-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type MatterManagementProps = {
  coreMatters: CoreMatter[];
  coreOnline: boolean;
  currentMatter?: CoreMatter | null;
  selectedMatterId: string;
  intakeSummary?: CoreIntakeSummary | null;
  onSelectMatter: (matterId: string) => void;
  onMatterCreated: (matter: CoreMatter) => void;
  onIntakeComplete: (result: CoreFullMatterIntakeEnvelope) => void;
};

export function MatterManagement({
  coreMatters,
  coreOnline,
  currentMatter,
  selectedMatterId,
  intakeSummary,
  onSelectMatter,
  onMatterCreated,
  onIntakeComplete,
}: MatterManagementProps) {
  const [matterName, setMatterName] = useState("");
  const [clientName, setClientName] = useState("");
  const [matterType, setMatterType] = useState("contract review");
  const [clientRole, setClientRole] = useState("");
  const [opposingParties, setOpposingParties] = useState("");
  const [requestedRelief, setRequestedRelief] = useState("");
  const [facts, setFacts] = useState("");
  const [documents, setDocuments] = useState("");
  const [busy, setBusy] = useState<"matter" | "intake" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateMatter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matterName.trim()) {
      setError("Matter name is required.");
      return;
    }
    setBusy("matter");
    setError(null);
    const response = await createMatter({
      name: matterName,
      client_name: clientName || undefined,
      matter_type: matterType || undefined,
      tier: "free",
    });
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Matter creation failed.");
      return;
    }
    onMatterCreated(response.data);
  }

  async function handleIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentMatter?.matter_id) {
      setError("Create or select a matter before saving intake.");
      return;
    }
    setBusy("intake");
    setError(null);
    const response = await submitFullMatterIntake({
      matter_id: currentMatter.matter_id,
      client: {
        client_id: currentMatter.client_id,
        client_name: clientName || currentMatter.client_name || currentMatter.name,
      },
      matter: {
        matter_id: currentMatter.matter_id,
        matter_name: matterName || currentMatter.name,
        matter_type: matterType || currentMatter.matter_type,
        jurisdiction: "District of Columbia",
        client_role: clientRole || currentMatter.client_role,
        opposing_parties: opposingParties
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
      facts: {
        summary: facts,
        key_facts: {
          intake_summary: facts,
        },
      },
      documents: documents
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((title, index) => ({
          document_id: `web-intake-doc-${index + 1}`,
          title,
          source: "mercy_legal_web",
        })),
      conflicts: {
        checked: false,
        status: "ready_for_review",
        opposing_parties: opposingParties
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
      scope: {
        confirmed: false,
        scope_of_work: requestedRelief,
        excluded_work: ["final legal advice without attorney approval"],
        client_responsibilities: ["verify facts", "provide complete documents"],
      },
      consent: {
        sensitivity_flags: ["confidential_client_matter"],
      },
      requested_relief: requestedRelief,
      sensitivity_flags: ["confidential_client_matter"],
    });
    setBusy(null);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Client intake failed.");
      return;
    }
    onIntakeComplete(response.data);
  }

  return (
    <Card id="matters">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Matter Management</CardTitle>
            <CardDescription>Tenant-scoped matter creation, selection, and D.C. intake.</CardDescription>
          </div>
          <Badge variant={coreOnline ? "secondary" : "risk"}>{coreOnline ? "Live core" : "Core unavailable"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-[#ead08a] bg-[#fff8e1] p-3 text-xs text-[#735b13]">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <form onSubmit={handleCreateMatter} className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-mercy-navy">
              <UserPlus className="size-4 text-[#9b740e]" />
              New matter
            </div>
            <div className="mt-3 grid gap-3">
              <Input value={matterName} onChange={(event) => setMatterName(event.target.value)} placeholder="Matter name" />
              <Input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Client name" />
              <Input value={matterType} onChange={(event) => setMatterType(event.target.value)} placeholder="Matter type" />
              <Button type="submit" variant="gold" disabled={busy !== null}>
                {busy === "matter" ? <Loader2 className="animate-spin" /> : <Save />}
                Create matter
              </Button>
            </div>
          </form>

          <form onSubmit={handleIntake} className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-mercy-navy">
              <BriefcaseBusiness className="size-4 text-[#9b740e]" />
              Client intake
            </div>
            <div className="mt-3 grid gap-3">
              <Input value={clientRole} onChange={(event) => setClientRole(event.target.value)} placeholder="Client role, e.g. tenant, petitioner, respondent" />
              <Input value={opposingParties} onChange={(event) => setOpposingParties(event.target.value)} placeholder="Opposing parties, comma-separated" />
              <Input value={requestedRelief} onChange={(event) => setRequestedRelief(event.target.value)} placeholder="Requested relief or objective" />
              <Textarea value={facts} onChange={(event) => setFacts(event.target.value)} placeholder="Key facts and procedural posture" className="min-h-20" />
              <Textarea value={documents} onChange={(event) => setDocuments(event.target.value)} placeholder="Documents, one per line" className="min-h-16" />
              <Button type="submit" variant="outline" disabled={busy !== null || !currentMatter}>
                {busy === "intake" ? <Loader2 className="animate-spin" /> : <Save />}
                Save full intake
              </Button>
            </div>
          </form>
        </div>

        {currentMatter && (
          <div className="rounded-md border border-[#d9c27a] bg-[#fffaf0] p-4 text-sm text-mercy-navy">
            <p className="font-semibold">Selected matter: {currentMatter.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {currentMatter.client_name ?? currentMatter.client_id} / {currentMatter.client_role ?? "role pending"} /{" "}
              {currentMatter.requested_relief ?? "requested relief pending"}
            </p>
            {intakeSummary && (
              <p className="mt-2 text-xs text-muted-foreground">
                Intake: conflict {intakeSummary.conflict_status.replace(/_/g, " ")}, scope{" "}
                {intakeSummary.scope_status.replace(/_/g, " ")}, {intakeSummary.missing_information_count} open item
                {intakeSummary.missing_information_count === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {coreMatters.length ? (
            coreMatters.map((matter) => (
              <button
                key={matter.matter_id}
                onClick={() => onSelectMatter(matter.matter_id)}
                className={`grid w-full gap-4 rounded-md border p-4 text-left transition md:grid-cols-[1fr_0.8fr_auto] md:items-center ${
                  selectedMatterId === matter.matter_id ? "border-[#d4af37] bg-[#fff9e8]" : "bg-white hover:border-[#d4af37]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-mercy-navy">
                    <BriefcaseBusiness className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-mercy-navy">{matter.client_name ?? matter.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{matter.name}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {Object.keys(matter.key_facts ?? matter.facts ?? {}).length} facts, {matter.documents?.length ?? 0} documents,{" "}
                  {matter.missing_information?.length ?? 0} open intake items
                </p>
                <Badge variant="secondary">{matter.jurisdiction ?? "D.C."}</Badge>
              </button>
            ))
          ) : (
            <div className="rounded-md border bg-white p-4 text-sm text-muted-foreground">
              No tenant matters returned. Create a matter to start live intake, RAG, and agent workflows.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
