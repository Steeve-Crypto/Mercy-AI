const RAW_PATTERNS = [
  /%PDF-\d/i,
  /\bobj\b[\s\S]{0,80}\bendobj\b/i,
  /\bstream\\?n/i,
  /\/BitsPerComponent|\/ColorSpace|\/Filter|\/CreationDate|\/Producer|\/Creator/i,
  /No module named|Traceback|ModuleNotFoundError|ImportError|optional dependency unavailable|fallback_reason|deterministic bridge fallback/i,
  /^\s*\{[\s\S]*\}\s*$/,
  /^\s*\[[\s\S]*\]\s*$/,
  /\\u0000|\\x[0-9a-f]{2}/i,
];

const EMPTY_VALUES = new Set(["", "n/a", "na", "none", "null", "undefined", "pending"]);

export function isUnsafeDisplayText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return false;
  if (text.length > 900) return true;
  if (RAW_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const symbolic = text.replace(/[a-z0-9\s.,;:'"()/-]/gi, "");
  return text.length > 160 && symbolic.length / text.length > 0.18;
}

export function safeText(value: unknown, fallback = "Pending"): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  if (EMPTY_VALUES.has(text.toLowerCase()) || isUnsafeDisplayText(text)) return fallback;
  return text;
}

export function safeList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n|,/) : [];
  return raw.map((item) => safeText(item, "")).filter(Boolean).slice(0, 8);
}

export function safeObjectEntries(value: unknown): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/fallback|debug|trace|raw|blob|payload|error|exception/i.test(key))
    .map(([key, raw]) => ({
      label: titleCase(key),
      value: Array.isArray(raw) ? safeList(raw).join(", ") : safeText(raw, ""),
    }))
    .filter((entry) => entry.value)
    .slice(0, 10);
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function formatActivityEvent(value: unknown): string {
  const event = safeText(value, "Matter event").toLowerCase();
  const labels: Record<string, string> = {
    matter_created: "Matter created",
    full_client_intake_received: "Client intake received",
    matter_context_updated: "Matter context updated",
    route_attached: "Reliability route attached",
    document_uploaded: "Document uploaded",
    document_attached: "Document attached",
    research_run: "Research run completed",
    agent_request_completed: "Mercy request completed",
  };
  return labels[event] ?? titleCase(event);
}

export function formatActivityDetail(event: unknown, detail: unknown): string {
  const safeDetail = safeText(detail, "");
  if (safeDetail) return safeDetail;
  const normalized = safeText(event, "").toLowerCase();
  if (normalized === "full_client_intake_received") return "Matter context was updated from intake.";
  if (normalized === "matter_context_updated") return "Matter context was updated.";
  if (normalized === "route_attached") return "Reliability route was prepared for this workflow.";
  if (normalized === "document_uploaded") return "Document was uploaded to this matter.";
  if (normalized === "document_attached") return "Document was attached to this matter.";
  if (normalized === "research_run") return "Research results were added to this matter.";
  return "Matter history updated.";
}

export function formatTimestamp(value: unknown): string {
  const text = safeText(value, "");
  if (!text || text === "Just now") return text || "Recorded";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return titleCase(text);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function extractionLimitedMessage(): string {
  return "Document extraction was limited. Mercy stored the file, but review may require a cleaner PDF or OCR-supported version.";
}
