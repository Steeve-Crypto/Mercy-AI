import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Text, Tooltip } from "@fluentui/react-components";
import {
  ArrowSync24Regular,
  CheckmarkCircle24Regular,
  DocumentArrowRight24Regular,
  Edit24Regular,
  LinkSquare24Regular,
  ShieldCheckmark24Regular
} from "@fluentui/react-icons";
import { api } from "../../services/api";
import { readDocumentText, readSelectedText } from "../../services/word";
import { AgentActionResult, CoreMcpManifest } from "../../types";
import { ReliabilitySignals } from "../metadata/ReliabilitySignals";
import "./McpSkillPanel.css";

interface McpSkillPanelProps {
  isBusy: boolean;
  onBusyChange: (busy: boolean) => void;
  onResult: (result: AgentActionResult) => void;
}

const skillIcons: Record<string, JSX.Element> = {
  cite_and_verify: <LinkSquare24Regular />,
  check_dc_ethics: <ShieldCheckmark24Regular />,
  update_matter_context: <Edit24Regular />,
  export_to_word: <DocumentArrowRight24Regular />
};

const fallbackSkillNames = ["cite_and_verify", "check_dc_ethics", "update_matter_context", "export_to_word"];

function skillGroup(skillName: string): "Sources" | "Ethics" | "Matter" | "Export" | "Agent" {
  if (skillName.includes("cite")) return "Sources";
  if (skillName.includes("ethics") || skillName.includes("guard")) return "Ethics";
  if (skillName.includes("matter") || skillName.includes("intake")) return "Matter";
  if (skillName.includes("export") || skillName.includes("word")) return "Export";
  return "Agent";
}

export function McpSkillPanel({ isBusy, onBusyChange, onResult }: McpSkillPanelProps) {
  const [manifest, setManifest] = useState<CoreMcpManifest | null>(null);
  const [lastResult, setLastResult] = useState<AgentActionResult | null>(null);
  const [queueCount, setQueueCount] = useState(api.queuedAgentRequestCount());
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getAgentSkills().then((nextManifest) => {
      if (mounted) {
        setManifest(nextManifest);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setIsOnline(navigator.onLine);
      setQueueCount(api.queuedAgentRequestCount());
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  const skills = useMemo(
    () =>
      manifest?.skills.length
        ? manifest.skills
        : fallbackSkillNames.map((name) => ({
            name,
            description: `${name.replace(/_/g, " ")} is available when the Mercy core skill manifest is reachable.`,
            input_schema: {},
            output_schema: {},
            tags: [],
            mcp_compatible: true
          })),
    [manifest],
  );

  const groupedSkills = useMemo(() => {
    return skills.reduce<Record<string, typeof skills>>((groups, skill) => {
      const group = skillGroup(skill.name);
      groups[group] = [...(groups[group] ?? []), skill];
      return groups;
    }, {});
  }, [skills]);

  const runSkill = async (skillName: string) => {
    onBusyChange(true);
    setError(null);
    try {
      const text = skillName === "check_dc_ethics" ? await readDocumentText() : await readSelectedText();
      const result = await api.runMcpSkill(skillName, text);
      setLastResult(result);
      onResult(result);
      setQueueCount(api.queuedAgentRequestCount());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Skill request failed. Retry when Word and the Mercy core are available.");
    } finally {
      onBusyChange(false);
    }
  };

  const sync = async () => {
    onBusyChange(true);
    setError(null);
    try {
      const synced = await api.syncOfflineAgentQueue();
      setQueueCount(api.queuedAgentRequestCount());
      if (synced) {
        setLastResult({
          title: "sync complete",
          content: `${synced} queued agent request${synced === 1 ? "" : "s"} synced with the Mercy core.`,
          core: {
            source: "core",
            coreUrl: "",
            humanReviewRequired: true,
            cacheStatus: "synced",
            syncStatus: "synced"
          }
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retry queue failed. Check core availability and try again.");
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <section className="mcpPanel">
      <div className="mcpHeader">
        <div>
          <Text weight="semibold">Mercy skills</Text>
          <Text className="mcpSubtext">
            {manifest ? "Live MCP discovery from /v1/agent/skills" : "Using cached skill metadata until the core responds"}
          </Text>
        </div>
        <div className="mcpBadges">
          <Badge appearance="tint" color={manifest ? "success" : "warning"}>
            {manifest ? `${skills.length} skills` : "offline cache"}
          </Badge>
          <Badge appearance="tint" color={isOnline ? "success" : "warning"}>
            {isOnline ? "online" : "offline"}
          </Badge>
        </div>
      </div>
      <div className="mcpGroupList">
        {Object.entries(groupedSkills).map(([group, groupSkills]) => (
          <div key={group} className="mcpGroup">
            <Text className="mcpGroupTitle">{group}</Text>
            <div className="mcpGrid">
              {groupSkills.map((skill) => (
                <Tooltip key={skill.name} content={skill.description || "Run this skill through /v1/agent/execute."} relationship="label">
                  <Button
                    icon={skillIcons[skill.name] ?? <CheckmarkCircle24Regular />}
                    onClick={() => runSkill(skill.name)}
                    disabled={isBusy}
                  >
                    {skill.name.replace(/_/g, " ")}
                  </Button>
                </Tooltip>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="syncRow">
        <Text className="mcpSubtext">
          {queueCount} queued / tenant isolated {manifest?.rag_backend?.tenant_isolated ? "yes" : "pending"} / official sources{" "}
          {manifest?.rag_backend?.source_registry?.official_source_count ??
            manifest?.rag_backend?.ingestion_contract?.official_source_count ??
            "pending"}
        </Text>
        <Tooltip content="Retry queued requests once the Mercy core is reachable. Confidential source text must be supplied again from the active document." relationship="label">
          <Button size="small" icon={<ArrowSync24Regular />} onClick={sync} disabled={isBusy || !queueCount}>
            Retry queue
          </Button>
        </Tooltip>
      </div>
      {manifest?.rag_backend?.production_blocked ? (
        <Text className="mcpSubtext warningLine">Production RAG is blocked until official external backends are configured.</Text>
      ) : null}
      {error ? <Text className="mcpSubtext warningLine">{error}</Text> : null}
      {lastResult ? (
        <div className="mcpResult">
          <Text weight="semibold">{lastResult.title}</Text>
          <Text className="mcpSubtext">{lastResult.content}</Text>
          <ReliabilitySignals core={lastResult.core} compact />
        </div>
      ) : null}
    </section>
  );
}
