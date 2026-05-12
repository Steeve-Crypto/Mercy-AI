import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Text } from "@fluentui/react-components";
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

export function McpSkillPanel({ isBusy, onBusyChange, onResult }: McpSkillPanelProps) {
  const [manifest, setManifest] = useState<CoreMcpManifest | null>(null);
  const [lastResult, setLastResult] = useState<AgentActionResult | null>(null);
  const [queueCount, setQueueCount] = useState(api.queuedAgentRequestCount());

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

  const skills = useMemo(() => manifest?.skills ?? [], [manifest]);

  const runSkill = async (skillName: string) => {
    onBusyChange(true);
    try {
      const text = skillName === "check_dc_ethics" ? await readDocumentText() : await readSelectedText();
      const result = await api.runMcpSkill(skillName, text);
      setLastResult(result);
      onResult(result);
      setQueueCount(api.queuedAgentRequestCount());
    } finally {
      onBusyChange(false);
    }
  };

  const sync = async () => {
    onBusyChange(true);
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
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <section className="mcpPanel">
      <div className="mcpHeader">
        <div>
          <Text weight="semibold">Agent skills</Text>
          <Text className="mcpSubtext">Live MCP discovery / Word-first</Text>
        </div>
        <Badge appearance="tint" color={manifest ? "success" : "warning"}>
          {manifest ? `${skills.length} skills` : "offline cache"}
        </Badge>
      </div>
      <div className="mcpGrid">
        {skills.map((skill) => (
          <Button
            key={skill.name}
            icon={skillIcons[skill.name] ?? <CheckmarkCircle24Regular />}
            onClick={() => runSkill(skill.name)}
            disabled={isBusy}
          >
            {skill.name.replace(/_/g, " ")}
          </Button>
        ))}
        {!skills.length &&
          ["cite_and_verify", "check_dc_ethics", "update_matter_context", "export_to_word"].map((skillName) => (
            <Button key={skillName} icon={skillIcons[skillName]} onClick={() => runSkill(skillName)} disabled={isBusy}>
              {skillName.replace(/_/g, " ")}
            </Button>
          ))}
      </div>
      <div className="syncRow">
        <Text className="mcpSubtext">{queueCount} queued</Text>
        <Button size="small" icon={<ArrowSync24Regular />} onClick={sync} disabled={isBusy || !queueCount}>
          Sync
        </Button>
      </div>
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

