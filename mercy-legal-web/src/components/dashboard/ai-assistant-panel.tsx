import { ArrowUp, Bot, CheckCircle2, Paperclip, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { CoreIntakeSummary, CoreMatterContext, CoreRouterEnvelope } from "@/lib/core-client";

type AiAssistantPanelProps = {
  router?: CoreRouterEnvelope | null;
  matterContext?: CoreMatterContext | null;
  intakeSummary?: CoreIntakeSummary | null;
};

export function AiAssistantPanel({ router, matterContext, intakeSummary }: AiAssistantPanelProps) {
  const route = router?.route;
  const envelope = router?.response_envelope;

  return (
    <Card id="assistant" className="overflow-hidden">
      <CardHeader className="border-b bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>AI Legal Assistant</CardTitle>
            <CardDescription>Ask across matters, documents, and DC-specific drafting context.</CardDescription>
          </div>
          <Badge variant="gold">{route ? route.expert_label : "Live context"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 bg-[#fbfcfe] p-5">
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mercy-navy text-white">
            <UserRound className="size-4" />
          </div>
          <div className="rounded-lg border bg-white p-4 text-sm leading-6 text-mercy-navy">
            Compare the indemnity language in the Shaw lease amendment against our preferred DC commercial lease position.
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
            <Bot className="size-4" />
          </div>
          <div className="flex-1 rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-sm leading-6 text-mercy-navy">
              The amendment creates a broader tenant indemnity than your preferred position. I would narrow it to claims arising from tenant-controlled acts, preserve landlord negligence carveouts, and add DC venue language.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                route ? `${Math.round(route.confidence * 100)}% route confidence` : "3 source excerpts",
                envelope ? `guardrails ${envelope.guardrail_status}` : "2 drafting options",
                envelope ? `${envelope.citations.length} citation marker` : "1 negotiation note",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-mercy-navy">
                  <CheckCircle2 className="size-3.5 text-[#9b740e]" />
                  {item}
                </div>
              ))}
            </div>
            {route && (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Router: {route.route_mode.replace(/_/g, " ")} via {route.selected_capability}. {route.next_action}
                {envelope
                  ? ` Audit ${new Date(envelope.audit_timestamp).toLocaleString()} | matter ${envelope.matter_context_snapshot.hash}.`
                  : ""}
              </p>
            )}
            {matterContext && (
              <div className="mt-3 grid gap-2 rounded-md bg-secondary/70 p-3 text-xs text-mercy-navy sm:grid-cols-2">
                <div>
                  <span className="font-semibold">Matter</span>
                  <p className="mt-1 text-muted-foreground">{matterContext.name}</p>
                </div>
                <div>
                  <span className="font-semibold">Context</span>
                  <p className="mt-1 text-muted-foreground">
                    {matterContext.jurisdiction} / {matterContext.client_role ?? "role pending"}
                  </p>
                </div>
                <div>
                  <span className="font-semibold">Documents</span>
                  <p className="mt-1 text-muted-foreground">{matterContext.documents?.length ?? 0} linked</p>
                </div>
                <div>
                  <span className="font-semibold">Updated</span>
                  <p className="mt-1 text-muted-foreground">
                    {matterContext.last_updated ? new Date(matterContext.last_updated).toLocaleString() : "pending"}
                  </p>
                </div>
                {intakeSummary && (
                  <>
                    <div>
                      <span className="font-semibold">Conflict</span>
                      <p className="mt-1 text-muted-foreground">{intakeSummary.conflict_status.replace(/_/g, " ")}</p>
                    </div>
                    <div>
                      <span className="font-semibold">Scope</span>
                      <p className="mt-1 text-muted-foreground">{intakeSummary.scope_status.replace(/_/g, " ")}</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <Textarea
            placeholder="Ask Mercy.ai to summarize, draft, compare, or explain..."
            className="min-h-20 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between border-t pt-3">
            <Button variant="ghost" size="sm">
              <Paperclip />
              Attach
            </Button>
            <Button variant="gold" size="sm">
              Send
              <ArrowUp />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
