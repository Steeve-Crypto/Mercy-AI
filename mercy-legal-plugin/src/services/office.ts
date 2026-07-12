import {
  insertRiskReport,
  insertTextAtCursor,
  readSelectedTextContext,
  writeOutlookDraftText,
  type OfficeTextSource
} from "./word";

export type OfficeSurface = "Word" | "Outlook" | "Office";
export type OfficeItemMode = "word-document" | "outlook-read" | "outlook-compose" | "preview";
export type OfficeApplyTarget = "replace-selection" | "append-document" | "write-draft";

export type OfficeContentContext = {
  surface: OfficeSurface;
  mode: OfficeItemMode;
  source: OfficeTextSource;
  text: string;
  subject?: string;
  sender?: string;
  recipients: string[];
  cc: string[];
  attachmentNames: string[];
  itemId?: string;
  canApply: boolean;
};

type MailAddress = {
  displayName?: string;
  emailAddress?: string;
};

type OfficeAsyncGetter<T> = {
  getAsync?: (callback: (result: Office.AsyncResult<T>) => void) => void;
};

export function detectOfficeSurface(): OfficeSurface {
  if (typeof Office === "undefined") {
    return "Office";
  }
  if (Office.context?.mailbox) {
    return "Outlook";
  }
  return "Word";
}

function addressLabel(address: MailAddress): string {
  const name = address.displayName?.trim();
  const email = address.emailAddress?.trim();
  if (name && email) return `${name} <${email}>`;
  return name || email || "";
}

function addressLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => addressLabel((item ?? {}) as MailAddress))
    .filter((item): item is string => Boolean(item));
}

async function readOfficeValue<T>(getter: OfficeAsyncGetter<T> | undefined): Promise<T | undefined> {
  if (typeof Office === "undefined" || !getter?.getAsync) return undefined;
  return new Promise((resolve) => {
    try {
      getter.getAsync!((result) => {
        resolve(result.status === Office.AsyncResultStatus.Succeeded ? result.value : undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

async function readSubject(value: unknown): Promise<string | undefined> {
  if (typeof value === "string") return value.trim() || undefined;
  const asyncValue = await readOfficeValue(value as OfficeAsyncGetter<string> | undefined);
  return asyncValue?.trim() || undefined;
}

async function readRecipientField(value: unknown): Promise<string[]> {
  const direct = addressLabels(value);
  if (direct.length) return direct;
  const asyncValue = await readOfficeValue(value as OfficeAsyncGetter<MailAddress[]> | undefined);
  return addressLabels(asyncValue);
}

export async function readOfficeContentContext(): Promise<OfficeContentContext> {
  const surface = detectOfficeSurface();
  const textContext = await readSelectedTextContext();

  if (surface !== "Outlook") {
    return {
      surface,
      mode: surface === "Word" ? "word-document" : "preview",
      source: textContext.source,
      text: textContext.text,
      recipients: [],
      cc: [],
      attachmentNames: [],
      canApply: surface === "Word"
    };
  }

  const item = Office.context?.mailbox?.item as unknown as {
    itemId?: string;
    subject?: string | OfficeAsyncGetter<string>;
    from?: MailAddress;
    sender?: MailAddress;
    to?: MailAddress[] | OfficeAsyncGetter<MailAddress[]>;
    cc?: MailAddress[] | OfficeAsyncGetter<MailAddress[]>;
    attachments?: Array<{ name?: string }>;
    body?: { setSelectedDataAsync?: unknown };
  } | undefined;

  const canWriteDraft = typeof item?.body?.setSelectedDataAsync === "function";
  const sender = addressLabel(item?.from ?? item?.sender ?? {});

  return {
    surface,
    mode: canWriteDraft ? "outlook-compose" : "outlook-read",
    source: textContext.source,
    text: textContext.text,
    subject: await readSubject(item?.subject),
    sender: sender || undefined,
    recipients: await readRecipientField(item?.to),
    cc: await readRecipientField(item?.cc),
    attachmentNames: (item?.attachments ?? [])
      .map((attachment) => attachment.name?.trim())
      .filter((name): name is string => Boolean(name)),
    itemId: item?.itemId,
    canApply: canWriteDraft
  };
}

export function formatOfficeContext(context: OfficeContentContext, maxCharacters = 18_000): string {
  const body = context.text.trim().slice(0, maxCharacters);
  const lines = [
    `Office surface: ${context.surface}`,
    `Office mode: ${context.mode}`,
    context.subject ? `Subject: ${context.subject}` : "",
    context.sender ? `From: ${context.sender}` : "",
    context.recipients.length ? `To: ${context.recipients.join(", ")}` : "",
    context.cc.length ? `Cc: ${context.cc.join(", ")}` : "",
    context.attachmentNames.length ? `Attachments (metadata only): ${context.attachmentNames.join(", ")}` : "",
    `Content source: ${context.source}`,
    "",
    context.source.includes("selection") ? "Selected content:" : "Permitted document/message context:",
    body || "[No readable Office content was available.]"
  ];
  return lines.filter((line, index) => line || index >= lines.length - 3).join("\n");
}

export async function applyApprovedOfficeText(text: string, target: OfficeApplyTarget): Promise<boolean> {
  if (target === "write-draft") {
    return writeOutlookDraftText(text);
  }
  if (target === "append-document") {
    if (typeof Word === "undefined") return false;
    await insertRiskReport(text);
    return true;
  }
  if (typeof Word === "undefined") return false;
  await insertTextAtCursor(text);
  return true;
}

export async function copyOfficeOutput(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Office hosts can deny the modern clipboard API; fall through to the DOM copy path.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}
