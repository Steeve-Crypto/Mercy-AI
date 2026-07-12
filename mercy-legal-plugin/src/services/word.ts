export type OfficeTextSource = "word-selection" | "word-document" | "outlook-selection" | "outlook-body" | "fallback";

export type OfficeTextContext = {
  text: string;
  source: OfficeTextSource;
};

export async function readDocumentText(): Promise<string> {
  if (typeof Word === "undefined") {
    return (
      await readOutlookBodyText("Office document body is unavailable. Open Mercy in Word or Outlook with an active document/message.")
    ).text;
  }

  return Word.run(async (context) => {
    const body = context.document.body;
    body.load("text");
    await context.sync();
    return body.text;
  });
}

export async function readSelectedText(): Promise<string> {
  if (typeof Word === "undefined") {
    return (
      await readOutlookSelectedTextOrBody(
        "Office selection is unavailable. Select text in Word, or open an Outlook message to analyze the message body."
      )
    ).text;
  }

  return Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    return selection.text;
  });
}

export async function insertTextAtCursor(text: string): Promise<void> {
  if (typeof Word === "undefined") {
    const inserted = await writeOutlookDraftText(text);
    if (inserted) {
      return;
    }
    console.info("Mercy preview insertion", text);
    return;
  }

  await Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.insertText(text, Word.InsertLocation.replace);
    await context.sync();
  });
}

export async function insertRiskReport(reportText: string): Promise<void> {
  if (typeof Word === "undefined") {
    const inserted = await writeOutlookDraftText(`\n\n${reportText}`);
    if (inserted) {
      return;
    }
    console.info("Mercy preview report", reportText);
    return;
  }

  await Word.run(async (context) => {
    context.document.body.insertParagraph(reportText, Word.InsertLocation.end);
    await context.sync();
  });
}

export async function readSelectedTextContext(): Promise<OfficeTextContext> {
  if (typeof Word === "undefined") {
    return readOutlookSelectedTextOrBody(
      "Office selection is unavailable. Select text in Word, or open an Outlook message to analyze the message body."
    );
  }

  return Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    const text = selection.text?.trim();
    if (text) {
      return { text, source: "word-selection" };
    }
    const body = context.document.body;
    body.load("text");
    await context.sync();
    return { text: body.text, source: "word-document" };
  });
}

async function readOutlookSelectedTextOrBody(fallback: string): Promise<OfficeTextContext> {
  const selected = await readOutlookSelectedText();
  if (selected.trim()) {
    return { text: selected, source: "outlook-selection" };
  }
  return readOutlookBodyText(fallback);
}

async function readOutlookSelectedText(): Promise<string> {
  const item = typeof Office !== "undefined" ? Office.context?.mailbox?.item : undefined;
  const mailboxItem = item as
    | {
        getSelectedDataAsync?: (
          coercionType: Office.CoercionType,
          callback: (result: Office.AsyncResult<string>) => void
        ) => void;
        body?: {
          getSelectedDataAsync?: (
            coercionType: Office.CoercionType,
            callback: (result: Office.AsyncResult<string>) => void
          ) => void;
        };
      }
    | undefined;

  const itemSelection = await readOutlookAsyncText(Boolean(mailboxItem?.getSelectedDataAsync), (callback) =>
    mailboxItem?.getSelectedDataAsync?.(Office.CoercionType.Text, callback)
  );
  if (itemSelection.trim()) {
    return itemSelection;
  }

  return readOutlookAsyncText(Boolean(mailboxItem?.body?.getSelectedDataAsync), (callback) =>
    mailboxItem?.body?.getSelectedDataAsync?.(Office.CoercionType.Text, callback)
  );
}

async function readOutlookBodyText(fallback: string): Promise<OfficeTextContext> {
  const item = typeof Office !== "undefined" ? Office.context?.mailbox?.item : undefined;
  const body = item?.body as
    | {
        getAsync?: (
          coercionType: Office.CoercionType,
          callback: (result: Office.AsyncResult<string>) => void
        ) => void;
      }
    | undefined;

  if (!body?.getAsync) {
    return { text: fallback, source: "fallback" };
  }

  return new Promise((resolve) => {
    body.getAsync!(Office.CoercionType.Text, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded && result.value?.trim()) {
        resolve({ text: result.value, source: "outlook-body" });
        return;
      }
      resolve({ text: fallback, source: "fallback" });
    });
  });
}

async function readOutlookAsyncText(
  available: boolean,
  run: (callback: (result: Office.AsyncResult<string>) => void) => void | undefined
): Promise<string> {
  if (typeof Office === "undefined" || !available) {
    return "";
  }

  return new Promise((resolve) => {
    try {
      run((result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded && typeof result.value === "string") {
          resolve(result.value);
          return;
        }
        resolve("");
      });
    } catch {
      resolve("");
    }
  });
}

export async function writeOutlookDraftText(text: string): Promise<boolean> {
  const item = typeof Office !== "undefined" ? Office.context?.mailbox?.item : undefined;
  const body = item?.body as
    | {
        setSelectedDataAsync?: (
          data: string,
          options: { coercionType: Office.CoercionType },
          callback: (result: Office.AsyncResult<void>) => void
        ) => void;
      }
    | undefined;

  if (!body?.setSelectedDataAsync) {
    return false;
  }

  return new Promise((resolve) => {
    body.setSelectedDataAsync!(text, { coercionType: Office.CoercionType.Text }, (result) => {
      resolve(result.status === Office.AsyncResultStatus.Succeeded);
    });
  });
}
