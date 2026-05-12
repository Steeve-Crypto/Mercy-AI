import { Badge, Button, Card, ProgressBar, Text } from "@fluentui/react-components";
import { CheckmarkCircle24Regular, Library24Regular, Sparkle24Regular } from "@fluentui/react-icons";
import { motion } from "framer-motion";
import { AnalysisResult, RiskLevel } from "../../types";
import { ReliabilitySignals } from "../metadata/ReliabilitySignals";
import "./RiskSummary.css";

interface RiskSummaryProps {
  analysis: AnalysisResult | null;
  isBusy: boolean;
  onAnalyzeDocument: () => Promise<void>;
}

const riskTone: Record<RiskLevel, "danger" | "warning" | "success"> = {
  high: "danger",
  medium: "warning",
  low: "success"
};

export function RiskSummary({ analysis, isBusy, onAnalyzeDocument }: RiskSummaryProps) {
  if (!analysis) {
    return (
      <section className="emptyRisk">
        <div>
          <Text as="h2" className="sectionTitle">
            Ready for attorney review
          </Text>
          <Text className="muted">Mercy will scan the document for enforceability, ambiguity, missing protections, and DC-specific drafting risk.</Text>
        </div>
        <div className="workflowList">
          <div>
            <Sparkle24Regular />
            <Text>Identify risky provisions</Text>
          </div>
          <div>
            <Library24Regular />
            <Text>Compare against DC clause patterns</Text>
          </div>
          <div>
            <CheckmarkCircle24Regular />
            <Text>Prepare attorney-ready next steps</Text>
          </div>
        </div>
        <Button appearance="primary" icon={<Sparkle24Regular />} onClick={onAnalyzeDocument} disabled={isBusy}>
          {isBusy ? "Analyzing document" : "Analyze Full Document"}
        </Button>
      </section>
    );
  }

  return (
    <section className="stack">
      <div className="scorePanel">
        <Text className="panelEyebrow">Document Assessment</Text>
        <Text weight="semibold">DC Risk Score</Text>
        <div className="scoreRow">
          <Text className="scoreValue">{analysis.score}</Text>
          <Text className="muted">/ 100</Text>
        </div>
        <ProgressBar value={analysis.score / 100} thickness="large" />
        <Text className="muted">{analysis.summary}</Text>
        {analysis.core?.route && (
          <Text className="muted">
            Router: {analysis.core.route.expert_label} / {analysis.core.route.route_mode.replace(/_/g, " ")} /{" "}
            {Math.round(analysis.core.route.confidence * 100)}% confidence. Guardrails:{" "}
            {analysis.core.guardrailStatus ?? analysis.core.route.guardrail_status}.
          </Text>
        )}
        {analysis.core?.citations?.length ? (
          <Text className="muted">
            Citation status: {analysis.core.citations.map((citation) => citation.verification_status).join(", ")}.
          </Text>
        ) : null}
        {analysis.core?.envelope && (
          <Text className="muted">
            Ethics: Opinion {analysis.core.envelope.dc_ethics_metadata.dc_bar_ethics_opinion}; matter{" "}
            {analysis.core.envelope.matter_context_snapshot.hash}; audit{" "}
            {new Date(analysis.core.envelope.audit_timestamp).toLocaleString()}.
          </Text>
        )}
        {analysis.core?.matterContext && (
          <Text className="muted">
            Current matter: {analysis.core.matterContext.name} / {analysis.core.matterContext.jurisdiction} /{" "}
            {analysis.core.matterContext.documents?.length ?? 0} document reference.
          </Text>
        )}
        {analysis.core?.intakeSummary && (
          <Text className="muted">
            Intake: conflict {analysis.core.intakeSummary.conflict_status.replace(/_/g, " ")}, scope{" "}
            {analysis.core.intakeSummary.scope_status.replace(/_/g, " ")},{" "}
            {analysis.core.intakeSummary.missing_information_count} open item
            {analysis.core.intakeSummary.missing_information_count === 1 ? "" : "s"}.
          </Text>
        )}
        <ReliabilitySignals core={analysis.core} />
      </div>

      {analysis.findings.map((finding, index) => (
        <motion.div
          key={finding.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.06 }}
        >
          <Card className={`riskCard ${finding.level}`}>
            <div className="riskCardHeader">
              <Text weight="semibold">{finding.title}</Text>
              <Badge appearance="tint" color={riskTone[finding.level]}>
                {finding.level}
              </Badge>
            </div>
            <Text className="excerpt">"{finding.excerpt}"</Text>
            <Text className="muted">{finding.dcContext}</Text>
            <Text>{finding.recommendation}</Text>
          </Card>
        </motion.div>
      ))}
    </section>
  );
}
