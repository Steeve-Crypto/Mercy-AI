import { useEffect, useState } from "react";
import { Badge, Button, Input, Text } from "@fluentui/react-components";
import { Database24Regular, ShieldCheckmark24Regular, ThumbDislike24Regular, ThumbLike24Regular } from "@fluentui/react-icons";
import { api } from "../../services/api";
import { AgentActionResult, CoreBetaStatus } from "../../types";
import "./BetaWelcome.css";

interface BetaWelcomeProps {
  lastResult?: AgentActionResult | null;
}

export function BetaWelcome({ lastResult }: BetaWelcomeProps) {
  const [status, setStatus] = useState<CoreBetaStatus | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getBetaStatus().then((nextStatus) => {
      if (mounted) setStatus(nextStatus);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function send(rating: "up" | "down") {
    if (!lastResult) return;
    await api.submitFeedback({
      rating,
      comment: comment.trim() || undefined,
      action: lastResult.title,
      trace_id: lastResult.core.traceId,
      route_expert: lastResult.core.agent?.selected_expert,
      guardrail_status: lastResult.core.guardrailStatus,
    });
    setComment("");
    setMessage("Feedback received");
  }

  return (
    <section className="betaWelcome">
      <div className="betaWelcomeHeader">
        <div>
          <Text weight="semibold">Limited beta</Text>
          <Text className="betaWelcomeCopy">Invite-only D.C. attorney beta with attorney-review and source-verification safeguards.</Text>
        </div>
        <Badge appearance="tint" color={status?.access === "active" ? "success" : "warning"}>
          {status?.access ?? "checking"}
        </Badge>
      </div>
      <div className="betaQuota">
        <div className="betaQuotaBox">
          <Text className="betaQuotaValue">{status?.quota.strong_model_remaining ?? "--"}</Text>
          <Text className="muted">strong messages left</Text>
        </div>
        <div className="betaQuotaBox">
          <Text className="betaQuotaValue">DPA + Terms</Text>
          <Text className="muted">available in web beta</Text>
        </div>
      </div>
      <Text className="betaWelcomeCopy">{status?.ethics_note ?? "Counsel must review and verify all AI-assisted output."}</Text>
      <div className="betaSecurity">
        <div className="betaSecurityItem">
          <ShieldCheckmark24Regular />
          <Text>SOC 2 Type 1 prep: audit logs, redaction, rate limiting, and security headers active.</Text>
        </div>
        <div className="betaSecurityItem">
          <Database24Regular />
          <Text>Tenant-isolated matter and official D.C. source grounding are enforced by the core API.</Text>
        </div>
      </div>
      {lastResult ? (
        <div className="feedbackRow">
          <Text weight="semibold">Rate last action</Text>
          <Input value={comment} onChange={(_, data) => setComment(data.value)} placeholder="Optional beta feedback" />
          <div className="feedbackActions">
            <Button size="small" icon={<ThumbLike24Regular />} onClick={() => send("up")}>Helpful</Button>
            <Button size="small" icon={<ThumbDislike24Regular />} onClick={() => send("down")}>Needs work</Button>
          </div>
          {message ? <Text className="muted">{message}</Text> : null}
        </div>
      ) : null}
    </section>
  );
}
