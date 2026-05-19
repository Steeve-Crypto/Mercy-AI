import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge, Divider, Tab, TabList, Text } from "@fluentui/react-components";
import {
  Chat24Regular,
  DocumentBulletList24Regular,
  DocumentAdd24Regular,
  DocumentEdit24Regular,
  Library24Regular,
  ShieldCheckmark24Regular
} from "@fluentui/react-icons";
import { MercyLogo } from "./components/brand/MercyLogo";
import { BetaWelcome } from "./components/beta/BetaWelcome";
import { AssistantChat } from "./components/chat/AssistantChat";
import { ClauseLibrary } from "./components/clauses/ClauseLibrary";
import { DocumentActions } from "./components/document/DocumentActions";
import { SidebarShell } from "./components/layout/SidebarShell";
import { RiskSummary } from "./components/risk/RiskSummary";
import { McpSkillPanel } from "./components/skills/McpSkillPanel";
import { TemplateGallery } from "./components/templates/TemplateGallery";
import { ReliabilitySignals } from "./components/metadata/ReliabilitySignals";
import { api } from "./services/api";
import { insertTextAtCursor, readDocumentText, readSelectedText } from "./services/word";
import { AgentActionResult, AnalysisResult, Clause, CoreMatterListItem, ProcessingState, SidebarView } from "./types";

const views: Array<{ value: SidebarView; label: string; icon: JSX.Element }> = [
  { value: "risk", label: "Risk", icon: <ShieldCheckmark24Regular /> },
  { value: "actions", label: "Actions", icon: <DocumentEdit24Regular /> },
  { value: "templates", label: "Templates", icon: <DocumentAdd24Regular /> },
  { value: "clauses", label: "Clauses", icon: <Library24Regular /> },
  { value: "chat", label: "Chat", icon: <Chat24Regular /> },
  { value: "report", label: "Report", icon: <DocumentBulletList24Regular /> }
];

export function App() {
  const [activeView, setActiveView] = useState<SidebarView>("risk");
  const [processing, setProcessing] = useState<ProcessingState>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAgentAction, setLastAgentAction] = useState<AgentActionResult | null>(null);
  const [matters, setMatters] = useState<CoreMatterListItem[]>([]);
  const [activeMatterId, setActiveMatterId] = useState("");
  const [coreStatus, setCoreStatus] = useState<"checking" | "online" | "offline">("checking");

  const isThinking = processing !== "idle";

  useEffect(() => {
    const sync = async () => {
      const synced = await api.syncOfflineAgentQueue();
      if (synced) {
        setSuccessMessage(`${synced} queued agent request${synced === 1 ? "" : "s"} synced`);
      }
    };
    window.addEventListener("online", sync);
    void sync();
    return () => window.removeEventListener("online", sync);
  }, []);

  useEffect(() => {
    const loadMatters = async () => {
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

    void loadMatters();
  }, []);

  const handleMatterChange = (matterId: string) => {
    const matter = matters.find((candidate) => candidate.matter_id === matterId) ?? null;
    setActiveMatterId(matterId);
    api.setActiveMatter(matter);
    setSuccessMessage(matter ? `${matter.name} context active` : "Using active Office document context");
  };

  const handleAnalyzeDocument = async () => {
    setProcessing("analyzing");
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const documentText = await readDocumentText();
      const result = await api.analyzeDocument(documentText);
      setAnalysis(result);
      setLastAgentAction({ title: "document analysis", content: result.summary, core: result.core! });
      setActiveView("risk");
      setSuccessMessage("Document analysis complete");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Document analysis could not be completed. Retry when Word and the Mercy core are available.");
    } finally {
      setProcessing("idle");
    }
  };

  const handleExplainSelection = async () => {
    setProcessing("explaining");
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const selectedText = await readSelectedText();
      const response = await api.explainClause(selectedText);
      if (response.core) {
        setLastAgentAction({ title: "selection analysis", content: response.content, core: response.core });
      }
      setActiveView("chat");
      setSuccessMessage("Clause explanation ready");
      return response;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Clause explanation could not be completed. Select text and retry.");
      return {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: "Core service temporarily unavailable - working in offline mode. Retry with the selected clause before relying on this explanation."
      };
    } finally {
      setProcessing("idle");
    }
  };

  const handleInsertClause = async (clause: Clause) => {
    setProcessing("inserting");
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await insertTextAtCursor(clause.text);
      setSuccessMessage(`${clause.title} inserted`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Word insert failed. Place the cursor in the document and retry.");
    } finally {
      window.setTimeout(() => setProcessing("idle"), 220);
    }
  };

  const handleBusyChange = (busy: boolean) => {
    setProcessing(busy ? "skill" : "idle");
  };

  const handleAgentAction = (result: AgentActionResult) => {
    setLastAgentAction(result);
    setErrorMessage(null);
    setSuccessMessage(`${result.title} complete`);
  };

  const runSelectionDraft = async (title: string, instruction: string) => {
    setProcessing("drafting");
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const selectedText = await readSelectedText();
      const response = await api.draftRevision(instruction, selectedText);
      if (response.core) {
        handleAgentAction({ title, content: response.content, core: response.core });
      }
      setActiveView("chat");
      setSuccessMessage(`${title} ready`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `${title} could not be completed. Retry when the Mercy core is available.`);
    } finally {
      setProcessing("idle");
    }
  };

  const handleDraftFromSelection = () =>
    runSelectionDraft(
      "draft from selection",
      "Draft attorney-review language from the selected Office text with D.C. law context, source grounding, and concise drafting notes."
    );

  const handleRedline = () =>
    runSelectionDraft(
      "redline suggestions",
      "Suggest redline-style revisions for the selected Office text. Explain risk, preserve client intent, and mark every recommendation as attorney review required."
    );

  const handleCiteCheck = async () => {
    setProcessing("skill");
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const selectedText = await readSelectedText();
      const result = await api.runMcpSkill("cite_and_verify", selectedText);
      handleAgentAction(result);
      setActiveView("chat");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Citation check could not be completed. Retry when Agent X is available.");
    } finally {
      setProcessing("idle");
    }
  };

  const handleEthicsCheck = async () => {
    setProcessing("skill");
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const documentText = await readDocumentText();
      const result = await api.runMcpSkill("check_dc_ethics", documentText);
      handleAgentAction(result);
      setActiveView("chat");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "D.C. ethics check could not be completed. Retry when Agent X is available.");
    } finally {
      setProcessing("idle");
    }
  };

  const content = (() => {
    switch (activeView) {
      case "clauses":
        return <ClauseLibrary onInsertClause={handleInsertClause} />;
      case "templates":
        return <TemplateGallery isBusy={isThinking} onBusyChange={handleBusyChange} onResult={handleAgentAction} />;
      case "chat":
        return <AssistantChat onExplainSelection={handleExplainSelection} />;
      case "actions":
        return (
          <DocumentActions
            analysis={analysis}
            onAnalyzeDocument={handleAnalyzeDocument}
            onDraftRevision={handleDraftFromSelection}
            onRedline={handleRedline}
            onCiteCheck={handleCiteCheck}
            onEthicsCheck={handleEthicsCheck}
            isBusy={isThinking}
          />
        );
      case "report":
        return (
          <DocumentActions
            analysis={analysis}
            onAnalyzeDocument={handleAnalyzeDocument}
            onDraftRevision={handleDraftFromSelection}
            onRedline={handleRedline}
            onCiteCheck={handleCiteCheck}
            onEthicsCheck={handleEthicsCheck}
            isBusy={isThinking}
          />
        );
      case "risk":
      default:
        return <RiskSummary analysis={analysis} isBusy={isThinking} onAnalyzeDocument={handleAnalyzeDocument} />;
    }
  })();

  return (
    <SidebarShell>
      <header className="appHeader">
        <div className="brandRow">
          <MercyLogo active={isThinking} />
          <div>
            <Text as="h1" className="appTitle">
              Mercy Legal AI
            </Text>
            <Text className="appSubtitle">Ask Agent X inside Word and Outlook</Text>
          </div>
        </div>
        <Badge appearance="outline" className="jurisdictionBadge">
          DC / Office
        </Badge>
      </header>

      <section className="contextBar" aria-label="Matter context">
        <label className="matterPicker">
          <span>Current matter</span>
          <select value={activeMatterId} onChange={(event) => handleMatterChange(event.target.value)}>
            <option value="">Active Office document only</option>
            {matters.map((matter) => (
              <option key={matter.matter_id} value={matter.matter_id}>
                {matter.name}
              </option>
            ))}
          </select>
        </label>
        <Badge appearance="tint" color={coreStatus === "online" ? "success" : coreStatus === "checking" ? "subtle" : "warning"}>
          Core {coreStatus}
        </Badge>
        <Badge appearance="tint" color="brand">
          surface office_addin
        </Badge>
      </section>

      <section className="reviewHero">
        <div>
          <Text className="heroKicker">Active Office Surface</Text>
          <Text as="h2" className="heroTitle">
            Agent X workspace
          </Text>
          <Text className="heroCopy">Analyze selections, draft revisions, check citations, and run D.C. ethics review without leaving Word or Outlook.</Text>
        </div>
        <div className="heroStats">
          <div>
            <Text className="statValue">{lastAgentAction?.core.route ? Math.round(lastAgentAction.core.route.confidence * 100) : analysis?.core?.route ? Math.round(analysis.core.route.confidence * 100) : "--"}</Text>
            <Text className="statLabel">Route confidence</Text>
          </div>
          <div>
            <Text className="statValue">
              {lastAgentAction?.core.cacheStatus === "queued"
                ? "Q"
                : lastAgentAction?.core.guardrailStatus ?? analysis?.core?.guardrailStatus ?? "--"}
            </Text>
            <Text className="statLabel">Reliability</Text>
          </div>
        </div>
      </section>

      <BetaWelcome lastResult={lastAgentAction} />

      {(lastAgentAction?.core ?? analysis?.core) && (
        <ReliabilitySignals core={lastAgentAction?.core ?? analysis?.core} compact />
      )}

      <DocumentActions
        analysis={analysis}
        onAnalyzeDocument={handleAnalyzeDocument}
        onDraftRevision={handleDraftFromSelection}
        onRedline={handleRedline}
        onCiteCheck={handleCiteCheck}
        onEthicsCheck={handleEthicsCheck}
        isBusy={isThinking}
        compact
      />

      <McpSkillPanel isBusy={isThinking} onBusyChange={handleBusyChange} onResult={handleAgentAction} />

      <TabList
        className="viewTabs"
        selectedValue={activeView}
        onTabSelect={(_, data) => setActiveView(data.value as SidebarView)}
      >
        {views.map((view) => (
          <Tab key={view.value} value={view.value} icon={view.icon}>
            {view.label}
          </Tab>
        ))}
      </TabList>

      <Divider className="softDivider" />

      <AnimatePresence mode="wait">
        <motion.main
          key={activeView}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="viewContent"
        >
          {content}
        </motion.main>
      </AnimatePresence>

      <AnimatePresence>
        {errorMessage && (
          <motion.div
            className="errorToast"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)}>
              Dismiss
            </button>
          </motion.div>
        )}
        {successMessage && (
          <motion.div
            className="successToast"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onAnimationComplete={() => window.setTimeout(() => setSuccessMessage(null), 1800)}
          >
            {successMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarShell>
  );
}
