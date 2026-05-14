import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Text } from "@fluentui/react-components";
import { DocumentAdd24Regular, Search24Regular } from "@fluentui/react-icons";
import { api } from "../../services/api";
import { readDocumentText } from "../../services/word";
import { AgentActionResult, CoreTemplateGalleryItem } from "../../types";
import { ReliabilitySignals } from "../metadata/ReliabilitySignals";
import "./TemplateGallery.css";

interface TemplateGalleryProps {
  isBusy: boolean;
  onBusyChange: (busy: boolean) => void;
  onResult: (result: AgentActionResult) => void;
}

export function TemplateGallery({ isBusy, onBusyChange, onResult }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<CoreTemplateGalleryItem[]>([]);
  const [query, setQuery] = useState("");
  const [practiceArea, setPracticeArea] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [lastResult, setLastResult] = useState<AgentActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getTemplateGallery().then((gallery) => {
      if (!mounted) return;
      if (gallery?.templates?.length) {
        setTemplates(gallery.templates);
      } else {
        setError("Template gallery unavailable. Reconnect to the Mercy core to load D.C. templates.");
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const practiceAreas = useMemo(() => Array.from(new Set(templates.map((template) => template.practice_area))).sort(), [templates]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return templates.filter((template) => {
      const haystack = `${template.title} ${template.description} ${template.practice_area}`.toLowerCase();
      return (
        (!practiceArea || template.practice_area === practiceArea) &&
        (!difficulty || template.difficulty === difficulty) &&
        (!normalized || haystack.includes(normalized))
      );
    });
  }, [difficulty, practiceArea, query, templates]);

  async function generate(template: CoreTemplateGalleryItem) {
    onBusyChange(true);
    setError(null);
    try {
      const documentText = await readDocumentText();
      const result = await api.generateTemplate(template, documentText);
      setLastResult(result);
      onResult(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Template generation failed. Retry with the Mercy core online.");
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <section className="templateGallery">
      <div className="templateToolbar">
        <Input
          contentBefore={<Search24Regular />}
          placeholder="Search D.C. templates"
          value={query}
          onChange={(_, data) => setQuery(data.value)}
        />
        <div className="templateSelectRow">
          <select value={practiceArea} onChange={(event) => setPracticeArea(event.target.value)}>
            <option value="">All areas</option>
            {practiceAreas.map((area) => (
              <option key={area} value={area}>
                {area.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      {error ? <Text className="mcpSubtext warningLine">{error}</Text> : null}

      {filtered.map((template) => (
        <article className="templateCard" key={template.template_id}>
          <div>
            <Text weight="semibold">{template.title}</Text>
            <div className="templateMeta">
              <Badge appearance="tint">{template.practice_area.replace(/_/g, " ")}</Badge>
              <Badge appearance="tint" color={template.difficulty === "advanced" ? "warning" : "success"}>
                {template.difficulty}
              </Badge>
            </div>
          </div>
          <Text className="templateDescription">{template.description}</Text>
          <Text className="templateInputs">Inputs: {template.required_inputs.map((input) => input.replace(/_/g, " ")).join(", ")}</Text>
          <Text className="templateInputs">Official D.C. grounding via PD038 seed + PD039 prompt: {template.prompt_template_id}</Text>
          <Button appearance="primary" icon={<DocumentAdd24Regular />} disabled={isBusy} onClick={() => generate(template)}>
            Generate with current matter
          </Button>
        </article>
      ))}

      {lastResult ? (
        <div className="templateResult">
          <Text weight="semibold">{lastResult.title}</Text>
          <Text className="templateResultText">{lastResult.content}</Text>
          <ReliabilitySignals core={lastResult.core} compact />
        </div>
      ) : null}
    </section>
  );
}
