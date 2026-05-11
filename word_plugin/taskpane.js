const coreUrl = "http://127.0.0.1:8000";
const output = document.querySelector("#output");
const statusLine = document.querySelector("#status");

let latestDraft = "";

async function postDraft() {
  output.textContent = "Drafting...";
  const payload = {
    facts: JSON.parse(document.querySelector("#factsJson").value || "{}"),
    draft_type: document.querySelector("#draftType").value,
    requested_relief: document.querySelector("#requestedRelief").value.trim() || null,
    matter_id: document.querySelector("#matterId").value.trim() || null,
  };
  const response = await fetch(`${coreUrl}/v1/workspace/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Draft request failed");
  latestDraft = data.draft || "";
  output.textContent = latestDraft;
  statusLine.textContent = `Guardrails: ${data.dc_guardrails?.status || "attached"}`;
}

function insertDraft() {
  if (!latestDraft) {
    statusLine.textContent = "Generate a draft first.";
    return;
  }
  if (!window.Office || !Office.context?.document) {
    navigator.clipboard.writeText(latestDraft);
    statusLine.textContent = "Draft copied because Word context is unavailable.";
    return;
  }
  Office.context.document.setSelectedDataAsync(latestDraft, { coercionType: Office.CoercionType.Text }, (result) => {
    statusLine.textContent = result.status === Office.AsyncResultStatus.Succeeded
      ? "Inserted at cursor."
      : result.error.message;
  });
}

document.querySelector("#draftButton").addEventListener("click", () => {
  postDraft().catch((error) => {
    output.textContent = error.message;
  });
});

document.querySelector("#insertButton").addEventListener("click", insertDraft);

if (window.Office) {
  Office.onReady(() => {
    statusLine.textContent = `Connected to ${coreUrl}`;
  });
}
