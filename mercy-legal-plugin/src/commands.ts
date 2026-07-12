import { api } from "./services/api";
import { insertRiskReport, insertTextAtCursor, readDocumentText, readSelectedText } from "./services/word";

type CommandEvent = {
  completed: () => void;
};

function confirmOfficeChange(title: string, content: string): boolean {
  if (typeof window === "undefined") return false;
  const preview = content.trim().slice(0, 1_200);
  return window.confirm(
    `${title}\n\nMercy will modify only the open Word selection or Outlook draft after you approve. ` +
      `Mercy never sends email.\n\nPreview:\n${preview}${content.length > preview.length ? "\n\n[Preview truncated]" : ""}`
  );
}

async function runSkillCommand(skillName: string, textProvider: () => Promise<string>, event: CommandEvent) {
  try {
    const text = await textProvider();
    const result = await api.runMcpSkill(skillName, text);
    const output = `\nMercy ${result.title}\n${result.content}\nReliability: ${
        result.core.groundingStatus ?? result.core.guardrailStatus ?? "attorney review required"
      }. Trace: ${result.core.traceId ?? "not available"}.\n`;
    if (confirmOfficeChange(`Approve Mercy ${result.title}`, output)) {
      await insertTextAtCursor(output);
    }
  } catch (error) {
    console.error(`Mercy command failed: ${skillName}`, error);
  } finally {
    event.completed();
  }
}

function reliabilityLine(result: { core?: { groundingStatus?: string; guardrailStatus?: string; traceId?: string; cacheStatus?: string; tenantId?: string } }): string {
  const core = result.core;
  return `Reliability: ${core?.groundingStatus ?? core?.guardrailStatus ?? "attorney review required"}; source ${
    core?.cacheStatus ?? "live"
  }; tenant ${core?.tenantId ?? "local"}; trace ${core?.traceId ?? "not available"}.`;
}

async function analyzeActiveDocument(event: CommandEvent) {
  try {
    const text = await readDocumentText();
    const result = await api.analyzeDocument(text);
    const output = `Mercy Legal Document Analysis\n\nScore: ${result.score}/100\n${reliabilityLine(result)}\n\n${result.summary}\n\nAttorney review is required before client use.`;
    if (confirmOfficeChange("Approve Mercy analysis report", output)) {
      await insertRiskReport(output);
    }
  } catch (error) {
    console.error("Mercy command failed: analyzeActiveDocument", error);
  } finally {
    event.completed();
  }
}

async function explainSelection(event: CommandEvent) {
  try {
    const text = await readSelectedText();
    const result = await api.explainClause(text);
    const output = `\nMercy clause explanation\n${result.content}\n${reliabilityLine(result)}\n`;
    if (confirmOfficeChange("Approve Mercy clause explanation", output)) {
      await insertTextAtCursor(output);
    }
  } catch (error) {
    console.error("Mercy command failed: explainSelection", error);
  } finally {
    event.completed();
  }
}

async function draftRevision(event: CommandEvent) {
  try {
    const text = await readSelectedText();
    const result = await api.draftRevision("Prepare an attorney-review revision for the selected text.", text);
    const output = `\nMercy draft revision\n${result.content}\n${reliabilityLine(result)}\n`;
    if (confirmOfficeChange("Approve Mercy draft revision", output)) {
      await insertTextAtCursor(output);
    }
  } catch (error) {
    console.error("Mercy command failed: draftRevision", error);
  } finally {
    event.completed();
  }
}

function citeAndVerify(event: CommandEvent) {
  void runSkillCommand("cite_and_verify", readSelectedText, event);
}

function checkDcEthics(event: CommandEvent) {
  void runSkillCommand("check_dc_ethics", readDocumentText, event);
}

function updateMatterContext(event: CommandEvent) {
  void runSkillCommand("update_matter_context", readSelectedText, event);
}

function exportToWord(event: CommandEvent) {
  void runSkillCommand("export_to_word", readSelectedText, event);
}

Office.onReady(() => {
  if (Office.actions) {
    Office.actions.associate("citeAndVerify", citeAndVerify);
    Office.actions.associate("checkDcEthics", checkDcEthics);
    Office.actions.associate("updateMatterContext", updateMatterContext);
    Office.actions.associate("exportToWord", exportToWord);
    Office.actions.associate("analyzeActiveDocument", analyzeActiveDocument);
    Office.actions.associate("explainSelection", explainSelection);
    Office.actions.associate("draftRevision", draftRevision);
  }
});
