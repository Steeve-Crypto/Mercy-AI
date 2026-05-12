import { Button, Text } from "@fluentui/react-components";
import { DocumentBulletList24Regular, Sparkle24Regular } from "@fluentui/react-icons";
import { motion } from "framer-motion";
import { AnalysisResult } from "../../types";
import { insertRiskReport } from "../../services/word";
import "./DocumentActions.css";

interface DocumentActionsProps {
  analysis: AnalysisResult | null;
  isBusy: boolean;
  compact?: boolean;
  onAnalyzeDocument: () => Promise<void>;
}

export function DocumentActions({ analysis, isBusy, compact = false, onAnalyzeDocument }: DocumentActionsProps) {
  const handleReport = async () => {
    const report = analysis
      ? `Mercy Legal Risk Report\n\nScore: ${analysis.score}/100\n\nRoute: ${
          analysis.core?.route
            ? `${analysis.core.route.expert_label} (${analysis.core.route.route_mode}, ${Math.round(
                analysis.core.route.confidence * 100,
              )}% confidence)`
            : "Not available"
        }\nGuardrails: ${analysis.core?.guardrailStatus ?? "attorney review required"}\nCitations: ${
          analysis.core?.citations?.map((citation) => `${citation.label} - ${citation.verification_status}`).join("; ") ??
          "[VERIFY CITE]"
        }\nAgent: ${
          analysis.core?.agent
            ? `${analysis.core.agent.selected_agent}; MCP skills ${analysis.core.agent.mcp_skills_used.join(", ") || "none"}`
            : "Not available"
        }\nGrounding: ${analysis.core?.groundingStatus ?? "attorney review required"}\nRAGAS: ${
          analysis.core?.ragasStatus ?? "not run"
        }\nTrace: ${analysis.core?.traceId ?? "Not available"} ${
          analysis.core?.langsmithUrl ? `(${analysis.core.langsmithUrl})` : ""
        }\nEthics: ${
          analysis.core?.envelope
            ? `D.C. Opinion ${analysis.core.envelope.dc_ethics_metadata.dc_bar_ethics_opinion}; matter ${analysis.core.envelope.matter_context_snapshot.hash}; audit ${analysis.core.envelope.audit_timestamp}`
            : "attorney review required"
        }\nMatter Context: ${
          analysis.core?.matterContext
            ? `${analysis.core.matterContext.name}; ${analysis.core.matterContext.jurisdiction}; ${
                analysis.core.matterContext.documents?.length ?? 0
              } document references`
            : "Not available"
        }\nIntake Summary: ${
          analysis.core?.intakeSummary
            ? `conflict ${analysis.core.intakeSummary.conflict_status}; scope ${analysis.core.intakeSummary.scope_status}; ${analysis.core.intakeSummary.missing_information_count} open items`
            : "Not available"
        }\n\n${analysis.summary}\n\nKey findings:\n${analysis.findings
          .map((finding) => `- ${finding.level.toUpperCase()}: ${finding.title} - ${finding.recommendation}`)
          .join("\n")}`
      : "Mercy Legal Risk Report\n\nRun a document analysis before generating the final risk report.";

    await insertRiskReport(report);
  };

  return (
    <motion.section className={compact ? "actionStrip compact" : "actionStrip"} layout whileHover={{ y: -1 }}>
      {!compact && (
        <div>
          <Text weight="semibold">Document tools</Text>
          <Text className="muted">Analyze, score, and report with DC context.</Text>
        </div>
      )}
      <div className="actionButtons">
        <Button appearance="primary" icon={<Sparkle24Regular />} onClick={onAnalyzeDocument} disabled={isBusy}>
          {isBusy ? "Reviewing" : "Analyze"}
        </Button>
        <Button icon={<DocumentBulletList24Regular />} onClick={handleReport} disabled={isBusy}>
          Report
        </Button>
      </div>
    </motion.section>
  );
}
