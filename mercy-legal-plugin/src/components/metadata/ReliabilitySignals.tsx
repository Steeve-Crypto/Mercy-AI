import { Badge, Link, Text, Tooltip } from "@fluentui/react-components";
import { CoreResponseMetadata } from "../../types";
import "./ReliabilitySignals.css";

interface ReliabilitySignalsProps {
  core?: CoreResponseMetadata;
  compact?: boolean;
}

function tone(status?: string): "success" | "warning" | "danger" | "important" | "subtle" {
  if (status === "pass" || status === "live") {
    return "success";
  }
  if (status === "block") {
    return "danger";
  }
  if (status === "warn" || status === "queued" || status === "cached" || status === "offline") {
    return "warning";
  }
  return "subtle";
}

export function ReliabilitySignals({ core, compact = false }: ReliabilitySignalsProps) {
  if (!core) {
    return null;
  }

  const routeLabel = core.route
    ? `${core.route.expert_label} / ${core.route.route_mode.replace(/_/g, " ")} / ${Math.round(core.route.confidence * 100)}%`
    : core.agent?.selected_agent ?? core.source;
  const skills = core.agent?.mcp_skills_used ?? [];
  const citationCount = core.citations?.length ?? 0;
  const missingInputs = core.route?.missing_inputs ?? [];
  const reviewFlags = core.reviewFlags ?? core.envelope?.dc_ethics_metadata.review_flags ?? [];

  return (
    <div className={compact ? "reliabilitySignals compact" : "reliabilitySignals"}>
      <div className="signalRow">
        <Tooltip content="D.C. guardrail status from the shared Mercy core." relationship="label">
          <Badge appearance="tint" color={tone(core.guardrailStatus)}>
            Guardrails {core.guardrailStatus ?? "review"}
          </Badge>
        </Tooltip>
        <Tooltip content="Grounding policy from RAG or agent execution." relationship="label">
          <Badge appearance="tint" color={tone(core.groundingStatus)}>
            Grounding {core.groundingStatus ?? "review"}
          </Badge>
        </Tooltip>
        <Tooltip content="Whether this response came from the live core, redacted cache, or offline queue." relationship="label">
          <Badge appearance="tint" color={tone(core.cacheStatus)}>
            {core.cacheStatus ?? core.source}
          </Badge>
        </Tooltip>
        <Tooltip content="RAGAS hook availability for regression evaluation." relationship="label">
          <Badge appearance="tint" color={tone(core.ragasStatus === "available" ? "pass" : undefined)}>
            RAGAS {core.ragasStatus ?? "pending"}
          </Badge>
        </Tooltip>
      </div>
      <div className="signalMetricGrid">
        <div>
          <Text className="metricLabel">MoE route</Text>
          <Text className="metricValue">{routeLabel}</Text>
        </div>
        <div>
          <Text className="metricLabel">Expert</Text>
          <Text className="metricValue">{core.route?.expert ?? core.agent?.selected_expert ?? "pending"}</Text>
        </div>
        <div>
          <Text className="metricLabel">Tenant</Text>
          <Text className="metricValue">{core.tenantId ?? core.matterContext?.tenant_id ?? "local"}</Text>
        </div>
        <div>
          <Text className="metricLabel">Official grounding</Text>
          <Text className="metricValue">{core.officialSourceGrounding ?? "pending"}</Text>
        </div>
      </div>
      <Text className="signalText">
        {citationCount} citation marker{citationCount === 1 ? "" : "s"} / selected capability{" "}
        {core.route?.selected_capability ?? "pending"} / sync {core.syncStatus ?? "unknown"}.
      </Text>
      {skills.length ? <Text className="signalText">MCP: {skills.join(", ")}.</Text> : null}
      {core.skillResults?.length ? (
        <Text className="signalText">
          Skill results: {core.skillResults.map((result) => `${result.skill_name}:${result.status}`).join(", ")}.
        </Text>
      ) : null}
      {core.matterContext ? (
        <Text className="signalText">
          Matter: {core.matterContext.name} / {core.matterContext.jurisdiction} /{" "}
          {core.intakeSummary?.missing_information_count ?? core.matterContext.missing_information?.length ?? 0} open item
          {(core.intakeSummary?.missing_information_count ?? core.matterContext.missing_information?.length ?? 0) === 1 ? "" : "s"}.
        </Text>
      ) : null}
      {core.envelope ? (
        <Text className="signalText">
          Snapshot {core.envelope.matter_context_snapshot.hash} / audit{" "}
          {new Date(core.envelope.audit_timestamp).toLocaleString()} / D.C. Ethics Opinion{" "}
          {core.envelope.dc_ethics_metadata.dc_bar_ethics_opinion}.
        </Text>
      ) : null}
      {missingInputs.length ? <Text className="signalText warningText">Missing input: {missingInputs.join(", ")}.</Text> : null}
      {reviewFlags.length ? <Text className="signalText warningText">Review flags: {reviewFlags.join(", ")}.</Text> : null}
      {core.citations?.length ? (
        <div className="citationList">
          {core.citations.slice(0, compact ? 2 : 4).map((citation) => (
            <div key={`${citation.label}-${citation.verification_status}`} className="citationItem">
              <Text className="metricValue">{citation.label}</Text>
              <Text className="signalText">
                {citation.source_type} / {citation.verification_status}
              </Text>
            </div>
          ))}
        </div>
      ) : null}
      <Text className="attorneyWarning">Requires attorney review before client use.</Text>
      {core.retryWhenOnline ? (
        <Text className="signalText warningText">
          Retry when online with the active document open. {core.queuedRequestCount ?? 0} queued request
          {(core.queuedRequestCount ?? 0) === 1 ? "" : "s"}.
        </Text>
      ) : null}
      {core.traceId ? (
        <Text className="signalText">
          Trace{" "}
          {core.langsmithUrl ? (
            <Link href={core.langsmithUrl} target="_blank" rel="noreferrer">
              {core.traceId.slice(0, 8)}
            </Link>
          ) : (
            core.traceId.slice(0, 8)
          )}
        </Text>
      ) : null}
      {core.fallbackReason ? <Text className="signalText">Fallback: {core.fallbackReason}</Text> : null}
    </div>
  );
}
