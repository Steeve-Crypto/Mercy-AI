import { AnalysisResult, ChatMessage } from "../types";
import { buildClauseExplanationPrompt, buildContractAnalysisPrompt, buildDraftingPrompt } from "../utils/prompts";

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const api = {
  async analyzeDocument(documentText: string): Promise<AnalysisResult> {
    await delay(900);
    console.debug("Mercy analysis prompt", buildContractAnalysisPrompt(documentText));

    return {
      score: 78,
      summary: "This draft is generally workable, with several provisions that should be tightened for DC enforceability and small-firm client clarity.",
      findings: [
        {
          id: "risk-1",
          level: "high",
          title: "Overbroad indemnity language",
          excerpt: "Client shall indemnify and hold harmless...",
          dcContext: "DC courts scrutinize broad risk-shifting provisions, especially where consumer or unequal bargaining concerns are present.",
          recommendation: "Limit indemnity to third-party claims, proportional fault, and reasonable defense costs."
        },
        {
          id: "risk-2",
          level: "medium",
          title: "Unclear governing law venue pairing",
          excerpt: "This agreement shall be governed by applicable law.",
          dcContext: "DC-focused agreements should expressly align governing law, venue, and forum selection.",
          recommendation: "Specify District of Columbia law and an appropriate DC court forum."
        },
        {
          id: "risk-3",
          level: "low",
          title: "Notice method could be cleaner",
          excerpt: "Notice may be delivered by mail or email.",
          dcContext: "Operational clarity helps small firms avoid avoidable disputes over receipt timing.",
          recommendation: "Add deemed-received timing for email, hand delivery, and certified mail."
        }
      ]
    };
  },

  async explainClause(selectedText: string): Promise<ChatMessage> {
    await delay(700);
    console.debug("Mercy explanation prompt", buildClauseExplanationPrompt(selectedText));

    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "This clause appears to allocate legal and financial responsibility between the parties. In a DC contract, I would check whether the language is mutual, proportional, and clear enough to survive close review."
    };
  },

  async draftRevision(instruction: string, context: string): Promise<string> {
    await delay(800);
    console.debug("Mercy drafting prompt", buildDraftingPrompt(instruction, context));

    return "Revised clause placeholder: Party responsibility is limited to direct losses arising from its own breach, negligence, or willful misconduct, subject to applicable District of Columbia law.";
  }
};
