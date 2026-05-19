export async function readDocumentText(): Promise<string> {
  if (typeof Word === "undefined") {
    return readOutlookBodyText("Office document body is unavailable. Open Mercy in Word or Outlook with an active document/message.");
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
    return readOutlookBodyText("Office selection is unavailable. Select text in Word, or open an Outlook message to analyze the message body.");
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
    const inserted = await insertOutlookText(text);
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
    const inserted = await insertOutlookText(`\n\n${reportText}`);
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

async function readOutlookBodyText(fallback: string): Promise<string> {
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
    return fallback;
  }

  return new Promise((resolve) => {
    body.getAsync!(Office.CoercionType.Text, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded && result.value?.trim()) {
        resolve(result.value);
        return;
      }
      resolve(fallback);
    });
  });
}

async function insertOutlookText(text: string): Promise<boolean> {
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
