export async function readDocumentText(): Promise<string> {
  if (typeof Word === "undefined") {
    return "Word runtime is unavailable; open this add-in inside Word to provide active document text.";
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
    return "Word runtime is unavailable; select document text inside Word and retry.";
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
    console.info("Mercy preview report", reportText);
    return;
  }

  await Word.run(async (context) => {
    context.document.body.insertParagraph(reportText, Word.InsertLocation.end);
    await context.sync();
  });
}
