import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Input, Spinner, Text, Textarea, Tooltip } from "@fluentui/react-components";
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
import { insertRiskReport, readDocumentText, readSelectedText, readSelectedTextContext } from "./services/word";
import { AgentActionResult, AnalysisResult, CoreMatterListItem, ProcessingState } from "./types";

type WorkflowKey = "analyze" | "draft" | "redline" | "cite" | "ethics" | "report";
const RECENT_MATTERS_KEY = "mercy.office.recentMatterIds";

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
  if (auth.source === "sign-in-required") {
    return "sign in required";
  }
  if (auth.source === "office-naa") {
    return "enterprise SSO";
  }
  if (auth.source === "office-pkce") {
    return "Office sign-in";
  }
  if (auth.source === "local-dev") {
    return "local dev session";
  }
  if (auth.source === "url-handoff") {
    return "web handoff";
  }
  if (auth.source === "office-settings") {
    return "Office session";
  }
  return "configured session";
}

function readRecentMatterIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_MATTERS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function rememberMatter(matterId: string): void {
  if (!matterId) {
    return;
  }
  try {
    const recent = readRecentMatterIds().filter((id) => id !== matterId);
    window.localStorage.setItem(RECENT_MATTERS_KEY, JSON.stringify([matterId, ...recent].slice(0, 8)));
  } catch {
    return;
  }
}

function sortRecentFirst(matters: CoreMatterListItem[]): CoreMatterListItem[] {
  const recent = readRecentMatterIds();
  return [...matters].sort((left, right) => {
    const leftIndex = recent.indexOf(left.matter_id);
    const rightIndex = recent.indexOf(right.matter_id);
    if (leftIndex === -1 && rightIndex === -1) {
      return (right.last_updated ?? "").localeCompare(left.last_updated ?? "");
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

export function App() {
  const [processing, setProcessing] = useState<ProcessingState>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [lastResponse, setLastResponse] = useState<AgentActionResult | null>(null);
  const [matters, setMatters] = useState<CoreMatterListItem[]>([]);
  const [activeMatterId, setActiveMatterId] = useState("");
  const activeMatterIdRef = useRef("");
  const [matterSearch, setMatterSearch] = useState("");
  const [matterLoading, setMatterLoading] = useState(false);
  const [auth, setAuth] = useState<MercyAuthStatus>(() => initializeAuthHandoff());
  const [authStage, setAuthStage] = useState<"checking-enterprise" | "signed-in" | "fallback-available" | "auth-failed">("checking-enterprise");
  const [coreStatus, setCoreStatus] = useState<"checking" | "online" | "offline">("checking");
  const [composer, setComposer] = useState("");
  const [detectedSelection, setDetectedSelection] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const surface = useMemo(() => officeSurface(), []);
  const isBusy = processing !== "idle";
  const signInRequired = auth.source === "sign-in-required" && !auth.hasToken;

  useEffect(() => {
    const load = async () => {
      const nextAuth = initializeAuthHandoff();
      setAuth(nextAuth);
      if (!nextAuth.hasToken && nextAuth.source === "sign-in-required") {
        setAuthStage("checking-enterprise");
        try {
          const enterpriseAuth = await api.beginOfficeNaaSignIn(surface, { allowSignInPrompt: false });
          setAuth(enterpriseAuth);
          setAuthStage("signed-in");
        } catch {
          setAuthStage("fallback-available");
          api.setActiveMatter(null);
          setMatters([]);
          setCoreStatus("offline");
          return;
        }
      }
      setAuthStage("signed-in");
      setCoreStatus("checking");
      try {
        const loadedMatters = sortRecentFirst(await api.listMatters());
        setMatters(loadedMatters);
        const firstMatter = loadedMatters[0] ?? null;
        activeMatterIdRef.current = firstMatter?.matter_id ?? "";
        setActiveMatterId(firstMatter?.matter_id ?? "");
        api.setActiveMatter(firstMatter);
        setCoreStatus("online");
      } catch {
        api.setActiveMatter(null);
        setCoreStatus("offline");
      }
    };

    void load();
  }, [surface]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      setMatterLoading(true);
      const loadedMatters = sortRecentFirst(await api.listMatters(matterSearch));
      setMatters(loadedMatters);
      if (activeMatterIdRef.current && !loadedMatters.some((matter) => matter.matter_id === activeMatterIdRef.current)) {
        const activeMatter = loadedMatters[0] ?? null;
        activeMatterIdRef.current = activeMatter?.matter_id ?? "";
        setActiveMatterId(activeMatter?.matter_id ?? "");
        api.setActiveMatter(activeMatter);
      }
      setMatterLoading(false);
    }, 240);

    return () => window.clearTimeout(handle);
  }, [matterSearch]);

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

  useEffect(() => {
    if (!notice) {
      return;
    }
    const handle = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(handle);
  }, [notice]);

  useEffect(() => {
    if (surface !== "Outlook") {
      return;
    }

    let mounted = true;
    const loadSelection = async () => {
      const context = await readSelectedTextContext();
      if (!mounted || context.source !== "outlook-selection" || !context.text.trim()) {
        return;
      }
      const selected = context.text.trim();
      setDetectedSelection(selected);
      setComposer((current) =>
        current.trim()
          ? current
          : `Analyze this selected Outlook text for D.C. legal risk, citations, and ethics guardrails:\n\n${selected.slice(0, 1200)}`
      );
      setNotice("Selected Outlook text loaded into Mercy");
    };

    void loadSelection();
    return () => {
      mounted = false;
    };
  }, [surface]);

  const handleMatterChange = (matterId: string) => {
    const matter = matters.find((candidate) => candidate.matter_id === matterId) ?? null;
    activeMatterIdRef.current = matterId;
    setActiveMatterId(matterId);
    rememberMatter(matterId);
    api.setActiveMatter(matter);
    setNotice(matter ? `${matter.name} context active` : "Using active Office content only");
  };

  const setResult = (result: AgentActionResult) => {
    setLastResponse(result);
    setErrorMessage(null);
  };

  const runSignIn = async () => {
    setProcessing("authenticating");
    setAuthStage("checking-enterprise");
    setNotice(null);
    setErrorMessage(null);
    try {
      const nextAuth = await api.beginOfficeHybridSignIn(surface);
      setAuth(nextAuth);
      setAuthStage("signed-in");
      setNotice("Signed in to Mercy");
      setCoreStatus("checking");
      const loadedMatters = sortRecentFirst(await api.listMatters());
      setMatters(loadedMatters);
      const firstMatter = loadedMatters[0] ?? null;
      activeMatterIdRef.current = firstMatter?.matter_id ?? "";
      setActiveMatterId(firstMatter?.matter_id ?? "");
      api.setActiveMatter(firstMatter);
      setCoreStatus("online");
    } catch (error) {
      setAuthStage("auth-failed");
      setErrorMessage(error instanceof Error ? error.message : "Mercy sign-in could not be completed.");
    } finally {
      setProcessing("idle");
    }
  };

  const runAnalyze = async () => {
    setProcessing("analyzing");
    setNotice(null);
    setErrorMessage(null);
    try {
      const selectionContext = surface === "Outlook" ? await readSelectedTextContext() : null;
      const documentText =
        selectionContext?.source === "outlook-selection" && selectionContext.text.trim()
          ? selectionContext.text
          : await readDocumentText();
      const result = await api.analyzeDocument(documentText);
      setAnalysis(result);
      setResult({ title: "Analyze", content: result.summary, core: result.core! });
      setNotice(selectionContext?.source === "outlook-selection" ? "Selected text analysis complete" : "Analysis complete");
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
      const selectionContext = await readSelectedTextContext();
      const context = selectionContext.source.includes("selection") ? selectionContext.text : await readDocumentText();
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
        {signInRequired ? (
          <div className="signinRequired" role="status">
            <Text weight="semibold">
              {authStage === "checking-enterprise"
                ? "Checking enterprise sign-in"
                : authStage === "auth-failed"
                  ? "Auth failed"
                  : "Sign in required"}
            </Text>
            <Text>
              {authStage === "fallback-available"
                ? "Enterprise SSO is unavailable here. Use the Supabase fallback to connect this task pane."
                : "Mercy tries Microsoft enterprise SSO first. Tenant access is verified by the Mercy core."}
            </Text>
            <Button appearance="primary" onClick={runSignIn} disabled={isBusy}>
              {isBusy ? "Opening sign-in..." : authStage === "fallback-available" ? "Use fallback sign-in" : "Sign in"}
            </Button>
          </div>
        ) : null}
        <label className="matterPicker">
          <span>Client matter</span>
          <Input
            className="matterSearchInput"
            value={matterSearch}
            onChange={(_, data) => setMatterSearch(data.value)}
            placeholder="Search matters"
            aria-label="Search matters"
          />
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
          <span className="sessionTenant">{auth.tenantId}</span>
          <span>{matterLoading ? "Searching matters" : `${matters.length} matter${matters.length === 1 ? "" : "s"}`}</span>
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
          <Text className="composerHint">
            {detectedSelection
              ? "Selected Outlook text is loaded. Mercy will still require attorney review and citation verification."
              : "Uses selected matter, active Office content, D.C. guardrails, and attorney-review metadata."}
          </Text>
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
        {lastResponse ? (
            <article key={`${lastResponse.title}-${lastResponse.core.traceId ?? lastResponse.content.slice(0, 16)}`} className="responseCard">
              <Text className="responseTitle">{lastResponse.title}</Text>
              <Text className="responseBody">{lastResponse.content}</Text>
              <ReliabilitySignals core={lastResponse.core} compact />
            </article>
        ) : (
            <div className="emptyResponse">
              <Text>Ask Mercy or run a workflow to see the response and reliability panel.</Text>
            </div>
        )}
      </section>

      <footer className="reviewFooter">Requires attorney review before client use. Verify all citations and D.C. source grounding.</footer>

      {errorMessage ? (
          <div className="officeToast error">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)}>
              Dismiss
            </button>
          </div>
      ) : null}
      {notice ? (
          <div className="officeToast">
            {notice}
          </div>
      ) : null}
    </div>
  );
}
