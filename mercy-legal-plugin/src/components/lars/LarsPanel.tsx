import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Spinner, Text, Textarea } from "@fluentui/react-components";
import {
  ArrowClockwise24Regular,
  CheckmarkCircle24Regular,
  DismissCircle24Regular,
  DocumentBulletList24Regular,
  Open24Regular,
} from "@fluentui/react-icons";
import { api } from "../../services/api";
import { insertTextAtCursor } from "../../services/word";

type LarsJobSummary = {
  job_id: string;
  status?: string;
  query?: string;
  matter_id?: string | null;
  updated_at?: string;
  pending_gates?: Array<Record<string, unknown>>;
  artifact_count?: number;
};

type LarsJobDetail = {
  phase?: string;
  job?: {
    job_id?: string;
    status?: string;
    assignment?: { query?: string; matter_id?: string | null; deliverable_type?: string };
    updated_at?: string;
  };
  pending_gates?: Array<Record<string, unknown>>;
  artifacts_catalog?: Array<{
    artifact_id?: string;
    kind?: string;
    title?: string;
    content_markdown?: string;
  }>;
  background_running?: boolean;
};

const WEB_WORKSPACE_BASE =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_MERCY_WEB_URL) ||
  "http://localhost:3000";

export function LarsPanel({ disabled }: { disabled?: boolean }) {
  const [jobs, setJobs] = useState<LarsJobSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LarsJobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gateNotes, setGateNotes] = useState("");
  const [offline, setOffline] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [startQuery, setStartQuery] = useState("");
  const [startMatterId, setStartMatterId] = useState("");
  const [instruction, setInstruction] = useState("");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listLarsJobs(20);
      if (!result) {
        setOffline(true);
        setJobs([]);
        setError("Assignments are unavailable. Core may be offline or your session expired.");
        return;
      }
      setOffline(false);
      setJobs((result.jobs || []) as LarsJobSummary[]);
    } catch (err) {
      setOffline(true);
      setError(err instanceof Error ? err.message : "Unable to load LARS jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (jobId: string, silent = false) => {
    if (!silent) setBusy(true);
    try {
      const result = await api.getLarsJob(jobId);
      if (!result) {
        setError("Unable to load job detail. Session may have expired.");
        setOffline(true);
        return;
      }
      setOffline(false);
      setDetail(result as LarsJobDetail);
      setSelectedId(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load job.");
    } finally {
      if (!silent) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!selectedId) return;
    const status = detail?.job?.status;
    const active = detail?.background_running || status === "running" || status === "verifying" || status === "queued";
    if (!active) return;
    const timer = window.setInterval(() => {
      void loadDetail(selectedId, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, detail?.background_running, detail?.job?.status, loadDetail]);

  async function decideGate(gateId: string, decision: string) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.decideLarsGate(selectedId, gateId, {
        decision,
        notes: gateNotes || undefined,
        continue_steps: 3,
      });
      if (!result) {
        setError("Gate decision failed. Check session and try again.");
        return;
      }
      setDetail(result as LarsJobDetail);
      setNotice(`Gate ${decision.replace(/_/g, " ")}.`);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gate decision failed.");
    } finally {
      setBusy(false);
    }
  }

  async function insertKind(kind: string) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await api.getLarsOfficeInsert(selectedId, kind);
      if (!payload) {
        setError("Insert payload unavailable.");
        return;
      }
      const text = String(payload.text || payload.markdown || "");
      if (!text.trim()) {
        setError("No content to insert for this artifact.");
        return;
      }
      const disclaimer = String(payload.disclaimer || "Attorney review required before client or court use.");
      await insertTextAtCursor(`${text}\n\n— ${disclaimer}`);
      setNotice(`Inserted ${kind.replace(/_/g, " ")} at cursor.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insert failed.");
    } finally {
      setBusy(false);
    }
  }

  async function startAssignment() {
    if (!startQuery.trim()) {
      setError("Describe the assignment before starting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.createLarsJob({
        query: startQuery.trim(),
        matter_id: startMatterId || undefined,
        deliverable_type: "research_memorandum",
        jurisdiction: "District of Columbia",
        research_depth: "standard",
        official_source_preference: true,
        require_adverse_authority_review: true,
        auto_approve_assignment: true,
      });
      if (!result || !result.job) {
        setError("Could not start assignment. Check session and try again.");
        return;
      }
      const job = result.job as { job_id?: string };
      setNotice("LARS assignment started.");
      setShowStart(false);
      setStartQuery("");
      await loadJobs();
      if (job.job_id) await loadDetail(job.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Start failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addInstruction() {
    if (!selectedId || !instruction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.addLarsNote(selectedId, { text: instruction.trim() });
      if (!result) {
        setError("Could not save instruction.");
        return;
      }
      setDetail(result as LarsJobDetail);
      setInstruction("");
      setNotice("Instruction recorded on the assignment.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Instruction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendSelectionToLars() {
    if (!selectedId) {
      setError("Select an assignment first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const selection = await Word.run(async (context) => {
        const range = context.document.getSelection();
        range.load("text");
        await context.sync();
        return range.text || "";
      });
      if (!selection.trim()) {
        setError("Select text in the document first.");
        setBusy(false);
        return;
      }
      const result = await api.addLarsNote(selectedId, {
        text: `Word selection sent to LARS for supporting authority / analysis:\n\n${selection.trim().slice(0, 4000)}`,
      });
      if (!result) {
        setError("Could not send selection.");
        return;
      }
      setDetail(result as LarsJobDetail);
      setNotice("Selected text sent to LARS as an attorney instruction.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read Word selection.");
    } finally {
      setBusy(false);
    }
  }

  function openWebWorkspace() {
    const matterId =
      (detail?.job?.assignment as { matter_id?: string | null } | undefined)?.matter_id ||
      jobs.find((j) => j.job_id === selectedId)?.matter_id ||
      null;
    const base = WEB_WORKSPACE_BASE.replace(/\/+$/, "");
    let url = `${base}/matters`;
    if (selectedId) {
      url =
        matterId && String(matterId).trim()
          ? `${base}/matters/${encodeURIComponent(String(matterId))}/assignments/${encodeURIComponent(selectedId)}`
          : `${base}/assignments/${encodeURIComponent(selectedId)}`;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const pendingGates = detail?.pending_gates || [];
  const artifacts = detail?.artifacts_catalog || [];

  return (
    <section className="lars-panel" aria-label="Mercy LARS">
      <div className="lars-panel__header">
        <div>
          <Text weight="semibold">Legal Autonomous Research System (LARS)</Text>
          <Text size={200} className="lars-panel__muted">
            Durable assignments · attorney review · insert into Word (full ALTS map stays in the web workspace)
          </Text>
        </div>
        <Button
          appearance="subtle"
          icon={<ArrowClockwise24Regular />}
          disabled={disabled || loading}
          onClick={() => void loadJobs()}
          aria-label="Refresh LARS jobs"
        />
      </div>

      <div className="lars-panel__actions lars-panel__actions--wrap">
        <Button size="small" appearance="primary" disabled={disabled || busy} onClick={() => setShowStart((v) => !v)}>
          {showStart ? "Hide start form" : "Start assignment"}
        </Button>
      </div>
      {showStart ? (
        <div className="lars-panel__detail">
          <Textarea
            value={startQuery}
            onChange={(_, data) => setStartQuery(data.value)}
            placeholder="What do you need Mercy to do?"
            resize="vertical"
            disabled={disabled || busy}
          />
          <Textarea
            value={startMatterId}
            onChange={(_, data) => setStartMatterId(data.value)}
            placeholder="Matter ID (optional)"
            resize="none"
            disabled={disabled || busy}
          />
          <Button size="small" appearance="primary" disabled={disabled || busy} onClick={() => void startAssignment()}>
            Start LARS assignment
          </Button>
        </div>
      ) : null}

      {offline ? (
        <div className="lars-panel__banner lars-panel__banner--warn">
          Offline or expired session. Sign in again and refresh before relying on assignment outputs.
        </div>
      ) : null}
      {error ? <div className="lars-panel__banner lars-panel__banner--error">{error}</div> : null}
      {notice ? <div className="lars-panel__banner">{notice}</div> : null}

      {loading ? (
        <div className="lars-panel__center">
          <Spinner size="tiny" label="Loading LARS jobs…" />
        </div>
      ) : (
        <ul className="lars-panel__list">
          {jobs.map((job) => (
            <li key={job.job_id}>
              <button
                type="button"
                className={`lars-panel__job ${selectedId === job.job_id ? "is-active" : ""}`}
                disabled={disabled}
                onClick={() => void loadDetail(job.job_id)}
              >
                <span className="lars-panel__job-title">{job.query || job.job_id}</span>
                <span className="lars-panel__job-meta">
                  <Badge appearance="outline" size="small">
                    {String(job.status || "unknown").replace(/_/g, " ")}
                  </Badge>
                  {(job.pending_gates?.length || 0) > 0 ? (
                    <Badge color="warning" size="small">
                      {job.pending_gates?.length} gate(s)
                    </Badge>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
          {!jobs.length ? <li className="lars-panel__muted">No assignments have been started yet.</li> : null}
        </ul>
      )}

      {detail?.job ? (
        <div className="lars-panel__detail">
          <div className="lars-panel__detail-row">
            <Text weight="semibold">Current stage</Text>
            <Badge appearance="filled" color="brand">
              {String(detail.phase || "—").replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="lars-panel__detail-row">
            <Text size={200}>Status</Text>
            <Text size={200}>{String(detail.job.status || "—").replace(/_/g, " ")}</Text>
          </div>
          {detail.background_running ? (
            <Text size={200} className="lars-panel__muted">
              Background execution active
            </Text>
          ) : null}

          <Text weight="semibold" className="lars-panel__section-title">
            Attorney review required
          </Text>
          <Textarea
            value={gateNotes}
            onChange={(_, data) => setGateNotes(data.value)}
            placeholder="Decision notes / revision instructions"
            resize="vertical"
            disabled={disabled || busy}
          />
          {pendingGates.map((gate) => (
            <div key={String(gate.gate_id)} className="lars-panel__gate">
              <Text weight="semibold">{String(gate.gate_type || "gate").replace(/_/g, " ")}</Text>
              <Text size={200}>{String(gate.prompt || "")}</Text>
              <div className="lars-panel__actions">
                <Button
                  size="small"
                  appearance="primary"
                  icon={<CheckmarkCircle24Regular />}
                  disabled={disabled || busy}
                  onClick={() => void decideGate(String(gate.gate_id), "approved")}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  disabled={disabled || busy}
                  onClick={() => void decideGate(String(gate.gate_id), "revision_requested")}
                >
                  Revise
                </Button>
                <Button
                  size="small"
                  appearance="secondary"
                  icon={<DismissCircle24Regular />}
                  disabled={disabled || busy}
                  onClick={() => void decideGate(String(gate.gate_id), "rejected")}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {!pendingGates.length ? <Text size={200} className="lars-panel__muted">No review decisions waiting.</Text> : null}

          <Text weight="semibold" className="lars-panel__section-title">
            Work product
          </Text>
          <ul className="lars-panel__artifacts">
            {artifacts.slice(0, 8).map((artifact) => (
              <li key={String(artifact.artifact_id)}>
                <DocumentBulletList24Regular />
                <span>{artifact.title || artifact.kind}</span>
              </li>
            ))}
            {!artifacts.length ? <li className="lars-panel__muted">No work product yet.</li> : null}
          </ul>

          <Text weight="semibold" className="lars-panel__section-title">
            Additional instruction
          </Text>
          <Textarea
            value={instruction}
            onChange={(_, data) => setInstruction(data.value)}
            placeholder="Add instruction, request deeper research, or note contradiction resolution"
            resize="vertical"
            disabled={disabled || busy}
          />
          <div className="lars-panel__actions lars-panel__actions--wrap">
            <Button size="small" disabled={disabled || busy || !instruction.trim()} onClick={() => void addInstruction()}>
              Add instruction
            </Button>
            <Button size="small" disabled={disabled || busy} onClick={() => void sendSelectionToLars()}>
              Send selected text to LARS
            </Button>
            <Button
              size="small"
              disabled={disabled || busy || !selectedId}
              onClick={() => {
                if (!selectedId) return;
                setBusy(true);
                void api
                  .addLarsNote(selectedId, {
                    text: "Request deeper research and supporting authority for the selected theory.",
                  })
                  .then((result) => {
                    setBusy(false);
                    if (!result) {
                      setError("Could not request supporting authority.");
                      return;
                    }
                    setDetail(result as LarsJobDetail);
                    setNotice("Deeper research / supporting authority request recorded.");
                  })
                  .catch((err: unknown) => {
                    setBusy(false);
                    setError(err instanceof Error ? err.message : "Request failed.");
                  });
              }}
            >
              Request supporting authority
            </Button>
          </div>

          <div className="lars-panel__actions lars-panel__actions--wrap">
            <Button size="small" disabled={disabled || busy} onClick={() => void insertKind("executive_summary")}>
              Insert executive summary
            </Button>
            <Button size="small" disabled={disabled || busy} onClick={() => void insertKind("research_memorandum")}>
              Insert selected section
            </Button>
            <Button size="small" disabled={disabled || busy} onClick={() => void insertKind("citation_matrix")}>
              Insert citation table
            </Button>
            <Button size="small" disabled={disabled || busy} onClick={() => void insertKind("open_questions")}>
              Insert open questions
            </Button>
            <Button
              size="small"
              disabled={disabled || busy}
              onClick={async () => {
                if (!selectedId) return;
                const payload = await api.getLarsOfficeInsert(selectedId, "research_memorandum");
                const text = String(payload?.text || payload?.markdown || "");
                if (!text.trim()) {
                  setError("No content available to replace selection.");
                  return;
                }
                try {
                  await Word.run(async (context) => {
                    const range = context.document.getSelection();
                    range.insertText(text, Word.InsertLocation.replace);
                    await context.sync();
                  });
                  setNotice("Replaced selected text with LARS work product.");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Replace failed.");
                }
              }}
            >
              Replace selected text
            </Button>
            <Button size="small" appearance="outline" icon={<Open24Regular />} onClick={openWebWorkspace}>
              Open assignment workspace
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
