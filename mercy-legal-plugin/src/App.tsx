import { useCallback, useEffect, useRef, useState } from "react";
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
import { ApprovalActions } from "./components/office/ApprovalActions";
import { OfficeContextCard } from "./components/office/OfficeContextCard";
import { api, initializeAuthHandoff, MercyAuthStatus } from "./services/api";
import {
  applyApprovedOfficeText,
  copyOfficeOutput,
  detectOfficeSurface,
  formatOfficeContext,
  readOfficeContentContext,
  type OfficeApplyTarget,
  type OfficeContentContext
} from "./services/office";
import { AgentActionResult, AnalysisResult, CoreMatterListItem, ProcessingState } from "./types";

type WorkflowKey =
  | "analyze"
  | "draft"
  | "redline"
  | "cite"
  | "ethics"
  | "report"
  | "summarize"
  | "triage"
  | "reply"
  | "save";

type PendingOfficeOutput = {
  text: string;
  target: OfficeApplyTarget;
  applyLabel: string;
};

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
    description: "Preview a reliability-backed review report.",
    icon: <DocumentBulletList24Regular />
  },
  summarize: {
    label: "Summarize thread",
    description: "Condense the permitted email context into material points.",
    icon: <Sparkle24Regular />
  },
  triage: {
    label: "Triage email",
    description: "Extract facts, deadlines, requests, obligations, risks, and follow-ups.",
    icon: <DocumentSearch24Regular />
  },
  reply: {
    label: "Draft reply",
    description: "Prepare a context-aware reply without changing or sending the message.",
    icon: <Edit24Regular />
  },
  save: {
    label: "Save to matter",
    description: "Add the permitted correspondence context to the selected matter history.",
    icon: <DocumentBulletList24Regular />
  }
};

function visibleWorkflows(surface: "Word" | "Outlook" | "Office"): WorkflowKey[] {
  return surface === "Outlook"
    ? ["summarize", "triage", "reply", "cite", "ethics", "save"]
    : ["analyze", "draft", "redline", "cite", "ethics", "report"];
}

function initialComposerPrompt(): string {
  if (typeof window === "undefined") return "";
  const prompt = new URLSearchParams(window.location.search).get("prompt");
  const prompts: Record<string, string> = {
    summarize: "Summarize this email thread. Prioritize material facts, decisions, deadlines, requests, and follow-up items.",
    triage: "Triage this email for material facts, deadlines, requests, obligations, legal risks, and recommended follow-up.",
    reply: "Draft a concise, professional reply using the permitted email context. Do not invent facts, commitments, or legal authority.",
    cite: "Review this Office context for legal propositions that require authoritative D.C. citations or source verification.",
    ethics: "Review this Office context for D.C. confidentiality, privilege, scope, supervision, and professional-responsibility concerns."
  };
  return prompt ? prompts[prompt] ?? "" : "";
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
  const [composer, setComposer] = useState(initialComposerPrompt);
  const [officeContext, setOfficeContext] = useState<OfficeContentContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [pendingOutput, setPendingOutput] = useState<PendingOfficeOutput | null>(null);
  const [applyingOutput, setApplyingOutput] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const surface = detectOfficeSurface();
  const isBusy = processing !== "idle";
  const signInRequired = auth.source === "sign-in-required" && !auth.hasToken;
  const workflowKeys = visibleWorkflows(surface);

  const refreshOfficeContext = useCallback(async (): Promise<OfficeContentContext | null> => {
    setContextLoading(true);
    try {
      const context = await readOfficeContentContext();
      setOfficeContext(context);
      return context;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Mercy could not read the active Office context.");
      return null;
    } finally {
      setContextLoading(false);
    }
  }, []);

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
      if (signInRequired) {
        setMatterLoading(false);
        return;
      }
      setMatterLoading(true);
      try {
        const loadedMatters = sortRecentFirst(await api.listMatters(matterSearch));
        setMatters(loadedMatters);
        if (activeMatterIdRef.current && !loadedMatters.some((matter) => matter.matter_id === activeMatterIdRef.current)) {
          const activeMatter = loadedMatters[0] ?? null;
          activeMatterIdRef.current = activeMatter?.matter_id ?? "";
          setActiveMatterId(activeMatter?.matter_id ?? "");
          api.setActiveMatter(activeMatter);
        }
      } catch {
        setCoreStatus("offline");
      } finally {
        setMatterLoading(false);
      }
    }, 240);

    return () => window.clearTimeout(handle);
  }, [matterSearch, signInRequired]);

  useEffect(() => {
    void refreshOfficeContext();
    if (surface !== "Outlook" || typeof Office === "undefined") return;

    const mailbox = Office.context?.mailbox as unknown as {
      addHandlerAsync?: (eventType: Office.EventType, handler: () => void) => void;
      removeHandlerAsync?: (eventType: Office.EventType, options: { handler: () => void }) => void;
    } | undefined;
    const handleItemChanged = () => void refreshOfficeContext();
    mailbox?.addHandlerAsync?.(Office.EventType.ItemChanged, handleItemChanged);
    return () => mailbox?.removeHandlerAsync?.(Office.EventType.ItemChanged, { handler: handleItemChanged });
  }, [refreshOfficeContext, surface]);

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

  const handleMatterChange = (matterId: string) => {
    const matter = matters.find((candidate) => candidate.matter_id === matterId) ?? null;
    activeMatterIdRef.current = matterId;
    setActiveMatterId(matterId);
    rememberMatter(matterId);
    api.setActiveMatter(matter);
    setNotice(matter ? `${matter.name} context active` : "Using active Office content only");
  };

  const setResult = (result: AgentActionResult, pending: PendingOfficeOutput | null = null) => {
    setLastResponse(result);
    setPendingOutput(pending);
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
      const context = await refreshOfficeContext();
      if (!context) throw new Error("Open a Word document or Outlook message before running analysis.");
      const result = await api.analyzeDocument(formatOfficeContext(context));
      setAnalysis(result);
      setResult({ title: "Analyze", content: result.summary, core: result.core! });
      setNotice(context.source.includes("selection") ? "Selected text analysis complete" : "Analysis complete");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Mercy could not analyze the active Office content.");
    } finally {
      setProcessing("idle");
    }
  };

  const runDraftingAction = async (
    title: string,
    instruction: string,
    approval?: { target: OfficeApplyTarget; label: string }
  ) => {
    setProcessing("drafting");
    setNotice(null);
    setErrorMessage(null);
    try {
      const context = await refreshOfficeContext();
      if (!context) throw new Error("Open an Office document or message before running this workflow.");
      const response = await api.draftRevision(instruction, formatOfficeContext(context));
      if (response.core) {
        setResult(
          { title, content: response.content, core: response.core },
          approval ? { text: response.content, target: approval.target, applyLabel: approval.label } : null
        );
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
      "Draft attorney-review language from the selected Office text with D.C. law context, source grounding, and concise drafting notes.",
      surface === "Outlook"
        ? { target: "write-draft", label: "Write to draft" }
        : { target: "replace-selection", label: "Replace selection" }
    );

  const runRedline = () =>
    runDraftingAction(
      "Redline",
      "Suggest redline-style revisions for the selected Office text. Explain risk, preserve client intent, and mark every recommendation as attorney review required.",
      { target: "replace-selection", label: "Replace selection" }
    );

  const runSummarize = () =>
    runDraftingAction(
      "Email summary",
      "Summarize the permitted Outlook message or thread context. Identify the participants, material facts, decisions, open questions, deadlines, requests, and follow-up items. Separate stated facts from inferences and do not invent missing context."
    );

  const runTriage = () =>
    runDraftingAction(
      "Email triage",
      "Triage the permitted Outlook context for a D.C. attorney. Return concise sections for material facts, explicit and inferred deadlines, requests, obligations, legal or client risks, attachment gaps, and recommended follow-up. Mark every inference and unsupported legal proposition for attorney verification."
    );

  const runReply = () =>
    runDraftingAction(
      "Draft reply",
      "Draft a concise, professional reply using only the permitted Outlook context and selected matter. Do not create commitments, admissions, deadlines, facts, or legal authority that are not supported. Include bracketed placeholders for missing decisions and keep the result attorney-review required.",
      { target: "write-draft", label: "Write to draft" }
    );

  const runSkill = async (title: string, skillName: "cite_and_verify" | "check_dc_ethics") => {
    setProcessing("skill");
    setNotice(null);
    setErrorMessage(null);
    try {
      const context = await refreshOfficeContext();
      if (!context) throw new Error("Open an Office document or message before running this workflow.");
      const result = await api.runMcpSkill(skillName, formatOfficeContext(context));
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
      const context = await refreshOfficeContext();
      if (!context) throw new Error("Open an Office document or message before asking Mercy.");
      const response = await api.draftRevision(composer.trim(), formatOfficeContext(context));
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

  const runSaveToMatter = async () => {
    if (!activeMatterId) {
      setErrorMessage("Select a client matter before saving correspondence.");
      return;
    }
    setProcessing("skill");
    setNotice(null);
    setErrorMessage(null);
    try {
      const context = await refreshOfficeContext();
      if (!context) throw new Error("Open an Outlook message before saving correspondence.");
      const historyEntry = [
        "Attorney-approved Outlook correspondence capture.",
        formatOfficeContext(context, 12_000),
        lastResponse ? `\nMercy output (${lastResponse.title}):\n${lastResponse.content.slice(0, 8_000)}` : ""
      ].filter(Boolean).join("\n");
      const preview = historyEntry.slice(0, 1_200);
      const approved = window.confirm(
        "Approve save to matter\n\nMercy will add this permitted Outlook context to the selected tenant/matter history. " +
          "Nothing will be sent or changed in Outlook.\n\nPreview:\n" +
          `${preview}${historyEntry.length > preview.length ? "\n\n[Preview truncated]" : ""}`
      );
      if (!approved) {
        setNotice("Save canceled. Nothing was added to the matter.");
        return;
      }
      const result = await api.runMcpSkill("update_matter_context", historyEntry, {
        officeCapture: {
          surface: "outlook",
          capture_kind: "correspondence",
          attorney_approved: true,
          approval_method: "explicit_save_to_matter_action"
        }
      });
      if (result.core.cacheStatus !== "live") {
        throw new Error(
          "Correspondence was not saved. Reconnect to the Mercy core, keep this Outlook item open, and approve Save to matter again."
        );
      }
      const captureResult = result.core.skillResults?.find((skill) => skill.skill_name === "update_matter_context");
      if (
        captureResult?.status !== "pass" ||
        captureResult.provenance?.history_event !== "office_correspondence_saved"
      ) {
        throw new Error(
          "The Mercy core did not confirm an approved Outlook history event. Nothing is reported as saved; refresh the matter and try again."
        );
      }
      setResult({ ...result, title: "Saved to matter" });
      setNotice("Correspondence saved to the selected matter");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Mercy could not save this correspondence to the matter.");
    } finally {
      setProcessing("idle");
    }
  };

  const runReport = () => {
    const core = lastResponse?.core ?? analysis?.core;
    if (!core) {
      setErrorMessage("Run Analyze or another Mercy workflow before preparing a report.");
      return;
    }
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
    setResult(
      { title: "Review report", content: report, core },
      { text: report, target: "append-document", applyLabel: "Append report" }
    );
    setNotice("Report preview ready");
  };

  const applyPendingOutput = async () => {
    if (!pendingOutput) return;
    setApplyingOutput(true);
    setProcessing("inserting");
    setErrorMessage(null);
    try {
      const applied = await applyApprovedOfficeText(pendingOutput.text, pendingOutput.target);
      if (!applied) {
        throw new Error(
          pendingOutput.target === "write-draft"
            ? "Open a reply or compose window before writing Mercy output to an Outlook draft."
            : "Office did not expose a writable document selection."
        );
      }
      setPendingOutput(null);
      setNotice(pendingOutput.target === "write-draft" ? "Written to draft — review before sending" : "Approved document change applied");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Mercy could not apply the approved output.");
    } finally {
      setApplyingOutput(false);
      setProcessing("idle");
    }
  };

  const copyLastOutput = async () => {
    if (!lastResponse) return;
    const copied = await copyOfficeOutput(lastResponse.content);
    setNotice(copied ? "Mercy output copied" : "Copy was blocked by this Office host");
  };

  const runWorkflow = (workflow: WorkflowKey) => {
    if (workflow === "analyze") void runAnalyze();
    if (workflow === "draft") void runDraft();
    if (workflow === "redline") void runRedline();
    if (workflow === "cite") void runSkill("Cite", "cite_and_verify");
    if (workflow === "ethics") void runSkill("Ethics", "check_dc_ethics");
    if (workflow === "report") runReport();
    if (workflow === "summarize") void runSummarize();
    if (workflow === "triage") void runTriage();
    if (workflow === "reply") void runReply();
    if (workflow === "save") void runSaveToMatter();
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

      <OfficeContextCard
        context={officeContext}
        loading={contextLoading}
        onRefresh={refreshOfficeContext}
      />

      <section className="composerPanel" aria-label="Ask Mercy">
        <Textarea
          className="mercyComposer"
          resize="vertical"
          value={composer}
          onChange={(_, data) => setComposer(data.value)}
          placeholder="Ask Mercy anything..."
          aria-label="Ask Mercy about the active Office context"
        />
        <div className="composerActions">
          <Text className="composerHint">
            {officeContext?.source.includes("selection")
              ? `Uses the active ${surface} selection, selected matter, and D.C. reliability controls.`
              : "Uses selected matter, permitted Office context, D.C. guardrails, and attorney-review metadata."}
          </Text>
          <Button appearance="primary" icon={isBusy ? <Spinner size="tiny" /> : <Send24Regular />} onClick={runComposer} disabled={isBusy || !composer.trim()}>
            Ask
          </Button>
        </div>
      </section>

      <section className="workflowSection" aria-label="Workflows">
        <div className="sectionHeader">
          <Text weight="semibold">{surface === "Outlook" ? "Email workflows" : "Document workflows"}</Text>
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
          {workflowKeys.map((key) => (
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

      <section className="responseSection" aria-label="Mercy response" aria-live="polite" aria-busy={isBusy}>
        <div className="sectionHeader">
          <Text weight="semibold">Mercy response</Text>
          {isBusy ? <Badge appearance="tint">Working</Badge> : null}
        </div>
        {lastResponse ? (
            <article key={`${lastResponse.title}-${lastResponse.core.traceId ?? lastResponse.content.slice(0, 16)}`} className="responseCard">
              <Text className="responseTitle">{lastResponse.title}</Text>
              <Text className="responseBody">{lastResponse.content}</Text>
              <ReliabilitySignals core={lastResponse.core} compact />
              <ApprovalActions
                surface={surface}
                applyLabel={pendingOutput?.applyLabel}
                canApply={
                  pendingOutput?.target === "write-draft"
                    ? Boolean(officeContext?.canApply && officeContext.mode === "outlook-compose")
                    : surface === "Word"
                }
                busy={applyingOutput || isBusy}
                onApply={() => void applyPendingOutput()}
                onCopy={() => void copyLastOutput()}
              />
            </article>
        ) : (
            <div className="emptyResponse">
              <Text>Ask Mercy or run a workflow to see the response and reliability panel.</Text>
            </div>
        )}
      </section>

      <footer className="reviewFooter">
        Requires attorney review before client use. Verify all citations and D.C. source grounding.
        {surface === "Outlook" ? " Mercy can write to a draft after approval but never sends email." : " Mercy never changes the document without approval."}
      </footer>

      {errorMessage ? (
          <div className="officeToast error" role="alert">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)}>
              Dismiss
            </button>
          </div>
      ) : null}
      {notice ? (
          <div className="officeToast" role="status">
            {notice}
          </div>
      ) : null}
    </div>
  );
}
