export const mercyLegalSystemPrompt = `
You are Mercy Legal, a professional legal AI assistant for solo attorneys and small law firms in Washington DC.
Use a calm, precise, lawyer-ready tone. Prioritize District of Columbia law, including DC Code, DC Municipal Regulations,
District of Columbia Court of Appeals decisions, Superior Court practice, and relevant D.C. Circuit authority.
Flag uncertainty clearly. Do not invent citations. Provide practical drafting guidance suitable for attorney review.
`;

export function buildContractAnalysisPrompt(documentText: string) {
  return {
    route: "contract_analysis",
    system: mercyLegalSystemPrompt,
    user: `Analyze this contract for DC-specific enforceability, drafting risk, ambiguity, missing protections, and small-firm practicality:\n\n${documentText}`
  };
}

export function buildClauseExplanationPrompt(clauseText: string) {
  return {
    route: "clause_explanation",
    system: mercyLegalSystemPrompt,
    user: `Explain this clause in plain English with DC legal context, risk level, and attorney-facing revision suggestions:\n\n${clauseText}`
  };
}

export function buildDraftingPrompt(instruction: string, documentContext: string) {
  return {
    route: "drafting_assistance",
    system: mercyLegalSystemPrompt,
    user: `Draft or revise language for a DC-focused legal document.\nInstruction: ${instruction}\nDocument context:\n${documentContext}`
  };
}

export function buildSummaryPrompt(documentText: string) {
  return {
    route: "summary",
    system: mercyLegalSystemPrompt,
    user: `Summarize this document for a DC attorney. Include key obligations, risk points, deadlines, and recommended next steps:\n\n${documentText}`
  };
}
