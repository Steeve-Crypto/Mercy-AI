export type RiskLevel = "high" | "medium" | "low";

export type SidebarView = "risk" | "clauses" | "chat" | "report";

export type ProcessingState = "idle" | "analyzing" | "explaining" | "inserting" | "drafting";

export interface RiskFinding {
  id: string;
  level: RiskLevel;
  title: string;
  excerpt: string;
  dcContext: string;
  recommendation: string;
}

export interface AnalysisResult {
  score: number;
  summary: string;
  findings: RiskFinding[];
}

export interface Clause {
  id: string;
  title: string;
  category: string;
  jurisdictionNote: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}
