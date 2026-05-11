const api = "";
const healthStatus = document.querySelector("#healthStatus");
const factsJson = document.querySelector("#factsJson");
const draftOutput = document.querySelector("#draftOutput");
const guardrailOutput = document.querySelector("#guardrailOutput");
const guardrailStatus = document.querySelector("#guardrailStatus");
const activeMatter = document.querySelector("#activeMatter");
const activeMatterIdDisplay = document.querySelector("#activeMatterId");

let activeMatterId = null;

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "Request failed");
  }
  return data;
}

async function checkHealth() {
  try {
    const data = await requestJson(`${api}/health`);
    healthStatus.textContent = `${data.product || "Mercy"} core online: ${data.clerk_os_version}`;
    healthStatus.className = "status ok";
  } catch (error) {
    healthStatus.textContent = "Core offline";
    healthStatus.className = "status warn";
  }
}

document.querySelector("#matterForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#matterName").value.trim();
  if (!name) return;
  const tier = document.querySelector("#matterTier").value;
  try {
    const matter = await requestJson(`${api}/v1/matters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tier }),
    });
    activeMatterId = matter.matter_id;
    activeMatter.textContent = `${matter.name} (${matter.tier})`;
    activeMatterIdDisplay.textContent = matter.matter_id;
  } catch (error) {
    activeMatter.textContent = error.message;
    activeMatterIdDisplay.textContent = "Matter creation failed.";
  }
});

function setBusy(form, busy) {
  form.querySelectorAll("button, input, textarea, select").forEach((control) => {
    control.disabled = busy;
  });
}

function showResult(data) {
  if (data.facts) {
    factsJson.value = JSON.stringify(data.facts, null, 2);
  }
  if (data.draft) {
    draftOutput.textContent = data.draft;
  }
  if (data.dc_guardrails) {
    guardrailStatus.textContent = data.dc_guardrails.status;
    guardrailOutput.textContent = JSON.stringify(data.dc_guardrails, null, 2);
  }
}

document.querySelector("#discoveryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = document.querySelector("#documentFile").files[0];
  const documentPath = document.querySelector("#documentPath").value.trim();
  const documentText = document.querySelector("#documentText").value.trim();

  setBusy(form, true);
  draftOutput.textContent = "Running discovery...";
  try {
    let data;
    if (file) {
      const body = new FormData();
      body.append("file", file);
      if (documentText) body.append("document_text", documentText);
      if (activeMatterId) body.append("matter_id", activeMatterId);
      data = await requestJson(`${api}/v1/workspace/discovery/upload`, {
        method: "POST",
        body,
      });
    } else {
      data = await requestJson(`${api}/v1/workspace/discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_path: documentPath,
          document_text: documentText || null,
          matter_id: activeMatterId,
        }),
      });
    }
    draftOutput.textContent = "Discovery complete. Facts are ready for drafting.";
    showResult(data);
  } catch (error) {
    draftOutput.textContent = error.message;
  } finally {
    setBusy(form, false);
  }
});

document.querySelector("#draftForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  draftOutput.textContent = "Drafting...";
  try {
    const parsedFacts = JSON.parse(factsJson.value || "{}");
    const data = await requestJson(`${api}/v1/workspace/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facts: parsedFacts,
        draft_type: document.querySelector("#draftType").value,
        requested_relief: document.querySelector("#requestedRelief").value.trim() || null,
        matter_id: activeMatterId,
      }),
    });
    showResult(data);
  } catch (error) {
    draftOutput.textContent = error.message;
  } finally {
    setBusy(form, false);
  }
});

document.querySelector("#copyDraft").addEventListener("click", async () => {
  await navigator.clipboard.writeText(draftOutput.textContent);
});

document.querySelector("#billingReport").addEventListener("click", async () => {
  if (!activeMatterId) {
    guardrailOutput.textContent = "Create a matter first.";
    return;
  }
  try {
    const report = await requestJson(`${api}/v1/matters/${activeMatterId}/billing-report`);
    guardrailStatus.textContent = "billing_report";
    guardrailOutput.textContent = JSON.stringify(report, null, 2);
  } catch (error) {
    guardrailOutput.textContent = error.message;
  }
});

checkHealth();
