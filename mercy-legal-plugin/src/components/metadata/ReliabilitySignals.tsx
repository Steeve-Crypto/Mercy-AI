import { Badge, Link, Text } from "@fluentui/react-components";
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
    ? `${core.route.expert_label} ${Math.round(core.route.confidence * 100)}%`
    : core.agent?.selected_agent ?? core.source;
  const skills = core.agent?.mcp_skills_used ?? [];
  const citationCount = core.citations?.length ?? 0;

  return (
    <div className={compact ? "reliabilitySignals compact" : "reliabilitySignals"}>
      <div className="signalRow">
        <Badge appearance="tint" color={tone(core.guardrailStatus)}>
          Guardrails {core.guardrailStatus ?? "review"}
        </Badge>
        <Badge appearance="tint" color={tone(core.groundingStatus)}>
          Grounding {core.groundingStatus ?? "review"}
        </Badge>
        <Badge appearance="tint" color={tone(core.cacheStatus)}>
          {core.cacheStatus ?? core.source}
        </Badge>
      </div>
      <Text className="signalText">
        {routeLabel} / {citationCount} citation marker{citationCount === 1 ? "" : "s"} / RAGAS{" "}
        {core.ragasStatus ?? "not run"}.
      </Text>
      {skills.length ? <Text className="signalText">MCP: {skills.join(", ")}.</Text> : null}
      {core.matterContext ? (
        <Text className="signalText">
          Matter: {core.matterContext.name} / {core.matterContext.jurisdiction} /{" "}
          {core.intakeSummary?.missing_information_count ?? core.matterContext.missing_information?.length ?? 0} open item
          {(core.intakeSummary?.missing_information_count ?? core.matterContext.missing_information?.length ?? 0) === 1 ? "" : "s"}.
        </Text>
      ) : null}
      <Text className="attorneyWarning">Requires attorney review before client use.</Text>
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

