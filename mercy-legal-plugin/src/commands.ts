import { api } from "./services/api";
import { insertTextAtCursor, readDocumentText, readSelectedText } from "./services/word";

type CommandEvent = {
  completed: () => void;
};

async function runSkillCommand(skillName: string, textProvider: () => Promise<string>, event: CommandEvent) {
  try {
    const text = await textProvider();
    const result = await api.runMcpSkill(skillName, text);
    await insertTextAtCursor(
      `\nMercy ${result.title}\n${result.content}\nReliability: ${
        result.core.groundingStatus ?? result.core.guardrailStatus ?? "attorney review required"
      }. Trace: ${result.core.traceId ?? "not available"}.\n`
    );
  } catch (error) {
    console.error(`Mercy command failed: ${skillName}`, error);
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
  }
});
