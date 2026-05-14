"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitBetaFeedback } from "@/lib/core-client";

type BetaFeedbackProps = {
  action: string;
  traceId?: string | null;
  routeExpert?: string | null;
  guardrailStatus?: string | null;
  templateId?: string | null;
};

export function BetaFeedback({ action, traceId, routeExpert, guardrailStatus, templateId }: BetaFeedbackProps) {
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  async function send(rating: "up" | "down") {
    const response = await submitBetaFeedback({
      rating,
      comment: comment.trim() || undefined,
      action,
      trace_id: traceId ?? undefined,
      route_expert: routeExpert ?? undefined,
      guardrail_status: guardrailStatus ?? undefined,
      template_id: templateId ?? undefined,
    });
    setSent(response.ok ? "Feedback received. Thank you." : response.error ?? "Feedback could not be sent.");
    if (response.ok) setComment("");
  }

  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-xs font-semibold text-mercy-navy">Beta feedback</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional comment" />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => send("up")} aria-label="Thumbs up">
            <ThumbsUp />
          </Button>
          <Button variant="outline" size="sm" onClick={() => send("down")} aria-label="Thumbs down">
            <ThumbsDown />
          </Button>
        </div>
      </div>
      {sent && <p className="mt-2 text-xs text-muted-foreground">{sent}</p>}
    </div>
  );
}
