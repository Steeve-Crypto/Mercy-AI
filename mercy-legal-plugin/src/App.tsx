import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge, Button, Spinner, Text, Textarea, Tooltip } from "@fluentui/react-components";
import {
  ArrowClockwise24Regular,
  CheckmarkCircle24Regular,
  DocumentBulletList24Regular,
  DocumentSearch24Regular,
  Edit24Regular,
  Send24Regular,
  ShieldCheckmark24Regular,
  Sparkle24Regular
} from "@fluentui/react-icons";
import { MercyLogo } from "./components/brand/MercyLogo";
import { ReliabilitySignals } from "./components/metadata/ReliabilitySignals";
import { api, initializeAuthHandoff, MercyAuthStatus } from "./services/api";
import { insertRiskReport, readDocumentText, readSelectedText } from "./services/word";
import { AgentActionResult, AnalysisResult, CoreMatterListItem, ProcessingState } from "./types";

type WorkflowKey = "analyze" | "draft" | "redline" | "cite" | "ethics" | "report";

const workflowCopy: Record<WorkflowKey, { label: string; description: string; icon: JSX.Element }> = {
  analyze: {
    label: "Analyze",
    description: "Review the active document or message for D.C. legal risk.",
    icon: <Sparkle24Regular />
  },
  draft: {
    label: "Draft",
    description: "Prepare attorney-review language from the selected text.",
    icon: <Edit24Regular />
  },
  redline: {
    label: "Redline",
    description: "Suggest revisions while preserving client intent.",
    icon: <DocumentSearch24Regular />
  },
  cite: {
    label: "Cite",
    description: "Check citation status and D.C. source grounding.",
    icon: <CheckmarkCircle24Regular />
  },
  ethics: {
    label: "Ethics",
    description: "Run D.C. confidentiality, review, and scope guardrails.",
    icon: <ShieldCheckmark24Regular />
  },
  report: {
    label: "Report",
    description: "Insert a reliability-backed review report.",
    icon: <DocumentBulletList24Regular />
  }
};

function officeSurface(): "Word" | "Outlook" | "Office" {
  if (typeof Office === "undefined") {
    return "Office";
  }
  if (Office.context?.mailbox) {
    return "Outlook";
  }
  return "Word";
}

function authLabel(auth: MercyAuthStatus): string {
  if (auth.source === "local-dev") {
    return "local dev session";
  }
  if (auth.source === "url-handoff") {
    return "web handoff";
  }
  if (auth.source === "office-settings") {
    return "Office session";
  }
  if (auth.source === "web-session") {
    return "web session";
  }
  return "configured session";
}

export function App() {
  const [processing, setProcessing] = useState<ProcessingState>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [lastResponse, setLastResponse] = useState<AgentActionResult | null>(null);
  const [matters, setMatters] = useState<CoreMatterListItem[]>([]);
  const [activeMatterId, setActiveMatterId] = useState("");
  const [auth, setAuth] = useState<MercyAuthStatus>(() => initializeAuthHandoff());
  const [coreStatus, setCoreStatus] = useState<"checking" | "online" | "offline">("checking");
  const [composer, setComposer] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const surface = useMemo(() => officeSurface(), []);
  const isBusy = processing !== "idle";

  useEffect(() => {
    const load = async () => {
      setAuth(initializeAuthHandoff());
      setCoreStatus("checking");
      try {
        const loadedMatters = await api.listMatters();
        setMatters(loadedMatters);
        const firstMatter = loadedMatters[0] ?? null;
        setActiveMatterId(firstMatter?.matter_id ?? "");
        api.setActiveMatter(firstMatter);
        setCoreStatus("online");
      } catch {
        api.setActiveMatter(null);
        setCoreStatus("offline");
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const sync = async () => {
      const synced = await api.syncOfflineAgentQueue();
      if (synced) {
        setNotice(`${synced} queued Mercy request${synced === 1 ? "" : "s"} synced`);
      }
    };
    window.addEventListener("online", sync);
    void sync();
    return () => window.removeEventListener("online", sync);
  }, []);

  const handleMatterChange = (matterId: string) => {
    const matter = matters.find((candidate) => candidate.matter_id === matterId) ?? null;
    setActiveMatterId(matterId);
    api.setActiveMatter(matter);
    setNotice(matter ? `${matter.name} context active` : "Using active Office content only");
  };

  const setResult = (result: AgentActionResult) => {
    setLastResponse(result);
    setErrorMessage(null);
  };

  const runAnalyze = async () => {
    setProcessing("analyzing");
    setNotice(null);
    setErrorMessage(null);
    try {
      const documentText = await readDocumentText();
      const result = await api.analyzeDocument(documentText);
      setAnalysis(result);
      setResult({ title: "Analyze", content: result.summary, core: result.core! });
      setNotice("Analysis complete");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Mercy could not analyze the active Office content.");
    } finally {
      setProcessing("idle");
    }
  };

  const runDraftingAction = async (title: string, instruction: string) => {
    setProcessing("drafting");
    setNotice(null);
    setErrorMessage(null);
    try {
      const selectedText = await readSelectedText();
      const response = await api.draftRevision(instruction, selectedText);
      if (response.core) {
        setResult({ title, content: response.content, core: response.core });
      }
      setNotice(`${title} ready`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `${title} could not be completed.`);
    } finally {
      setProcessing("idle");
    }
  };

  const runDraft = () =>
    runDraftingAction(
      "Draft",
      "Draft attorney-review language from the selected Office text with D.C. law context, source grounding, and concise drafting notes."
    );

  const runRedline = () =>
    runDraftingAction(
      "Redline",
      "Suggest redline-style revisions for the selected Office text. Explain risk, preserve client intent, and mark every recommendation as attorney review required."
    );

  const runSkill = async (title: string, skillName: "cite_and_verify" | "check_dc_ethics") => {
    setProcessing("skill");
    setNotice(null);
    setErrorMessage(null);
    try {
      const text = skillName === "check_dc_ethics" ? await readDocumentText() : await readSelectedText();
      const result = await api.runMcpSkill(skillName, text);
      setResult({ ...result, title });
      setNotice(`${title} complete`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `${title} could not be completed by Mercy.`);
    } finally {
      setProcessing("idle");
    }
  };

  const runComposer = async () => {
    if (!composer.trim()) {
      return;
    }
    setProcessing("drafting");
    setNotice(null);
    setErrorMessage(null);
    try {
      const context = await readDocumentText();
      const response = await api.draftRevision(composer.trim(), context);
      if (response.core) {
        setResult({ title: "Ask Mercy", content: response.content, core: response.core });
      }
      setComposer("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Mercy could not complete that request.");
    } finally {
      setProcessing("idle");
    }
  };

  const runReport = async () => {
    const core = lastResponse?.core ?? analysis?.core;
    const report = analysis
      ? `Mercy Legal AI Review Report\n\nMatter: ${
          matters.find((matter) => matter.matter_id === activeMatterId)?.name ?? "Active Office content"
        }\nRoute: ${
          core?.route
            ? `${core.route.expert_label} (${core.route.route_mode}, ${Math.round(core.route.confidence * 100)}% confidence)`
            : "pending"
        }\nGuardrails: ${core?.guardrailStatus ?? "review required"}\nD.C. grounding: ${
          core?.officialSourceGrounding ?? core?.groundingStatus ?? "pending"
        }\nCitations: ${core?.citations?.map((citation) => `${citation.label} - ${citation.verification_status}`).join("; ") ?? "[VERIFY CITE]"}\nLangSmith: ${
          core?.langsmithUrl ?? core?.traceId ?? "not available"
        }\nAttorney review: required\n\n${analysis.summary}\n\nFindings:\n${analysis.findings
          .map((finding) => `- ${finding.level.toUpperCase()}: ${finding.title} - ${finding.recommendation}`)
          .join("\n")}`
      : `Mercy Legal AI Review Report\n\nRun Analyze before generating a full report.\n\nLast response:\n${lastResponse?.content ?? "No Mercy response yet."}`;
    await insertRiskReport(report);
    setNotice("Report inserted");
  };

  const runWorkflow = (workflow: WorkflowKey) => {
    if (workflow === "analyze") void runAnalyze();
    if (workflow === "draft") void runDraft();
    if (workflow === "redline") void runRedline();
    if (workflow === "cite") void runSkill("Cite", "cite_and_verify");
    if (workflow === "ethics") void runSkill("Ethics", "check_dc_ethics");
    if (workflow === "report") void runReport();
  };

  return (
    <div className="officePane">
      <header className="paneHeader">
        <div className="brandLine">
          <MercyLogo active={isBusy} />
          <div className="brandText">
            <Text as="h1" className="paneTitle">
              Mercy Legal AI
            </Text>
            <Text className="paneSubtitle">{surface} task pane</Text>
          </div>
        </div>
        <Badge appearance="tint" color={coreStatus === "online" ? "success" : coreStatus === "checking" ? "subtle" : "warning"}>
          {coreStatus === "online" ? "Core online" : coreStatus === "checking" ? "Checking" : "Local fallback"}
        </Badge>
      </header>

      <section className="matterPanel" aria-label="Matter context">
        <label className="matterPicker">
          <span>Client matter</span>
          <select value={activeMatterId} onChange={(event) => handleMatterChange(event.target.value)}>
            <option value="">Active Office content only</option>
            {matters.map((matter) => (
              <option key={matter.matter_id} value={matter.matter_id}>
                {matter.name}
              </option>
            ))}
          </select>
        </label>
        <div className="sessionLine">
          <span>{authLabel(auth)}</span>
          <span>{auth.tenantId}</span>
        </div>
      </section>

      <section className="composerPanel" aria-label="Ask Mercy">
        <Textarea
          className="mercyComposer"
          resize="vertical"
          value={composer}
          onChange={(_, data) => setComposer(data.value)}
          placeholder="Ask Mercy anything..."
        />
        <div className="composerActions">
          <Text className="composerHint">Uses selected matter, active Office content, D.C. guardrails, and attorney-review metadata.</Text>
          <Button appearance="primary" icon={isBusy ? <Spinner size="tiny" /> : <Send24Regular />} onClick={runComposer} disabled={isBusy || !composer.trim()}>
            Ask
          </Button>
        </div>
      </section>

      <section className="workflowSection" aria-label="Workflows">
        <div className="sectionHeader">
          <Text weight="semibold">Workflows</Text>
          <Tooltip content="Retry queued requests once Mercy core is reachable." relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<ArrowClockwise24Regular />}
              onClick={async () => {
                const synced = await api.syncOfflineAgentQueue();
                setNotice(synced ? `${synced} request${synced === 1 ? "" : "s"} synced` : "No queued requests");
              }}
              disabled={isBusy}
            />
          </Tooltip>
        </div>
        <div className="workflowList">
          {(Object.keys(workflowCopy) as WorkflowKey[]).map((key) => (
            <button key={key} type="button" className="workflowButton" onClick={() => runWorkflow(key)} disabled={isBusy}>
              <span className="workflowIcon">{workflowCopy[key].icon}</span>
              <span>
                <strong>{workflowCopy[key].label}</strong>
                <small>{workflowCopy[key].description}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="responseSection" aria-label="Mercy response">
        <div className="sectionHeader">
          <Text weight="semibold">Mercy response</Text>
          {isBusy ? <Badge appearance="tint">Working</Badge> : null}
        </div>
        <AnimatePresence mode="wait">
          {lastResponse ? (
            <motion.article
              key={`${lastResponse.title}-${lastResponse.core.traceId ?? lastResponse.content.slice(0, 16)}`}
              className="responseCard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <Text className="responseTitle">{lastResponse.title}</Text>
              <Text className="responseBody">{lastResponse.content}</Text>
              <ReliabilitySignals core={lastResponse.core} compact />
            </motion.article>
          ) : (
            <motion.div className="emptyResponse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Text>Ask Mercy or run a workflow to see the response and reliability panel.</Text>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <footer className="reviewFooter">Requires attorney review before client use. Verify all citations and D.C. source grounding.</footer>

      <AnimatePresence>
        {errorMessage ? (
          <motion.div className="officeToast error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)}>
              Dismiss
            </button>
          </motion.div>
        ) : null}
        {notice ? (
          <motion.div
            className="officeToast"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onAnimationComplete={() => window.setTimeout(() => setNotice(null), 1800)}
          >
            {notice}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
