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
      ? `Mercy Legal Risk Report\n\nScore: ${analysis.score}/100\n\n${analysis.summary}\n\nKey findings:\n${analysis.findings
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
