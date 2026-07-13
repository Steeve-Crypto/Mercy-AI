#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));

const manifests = ["manifest.xml", "manifest.outlook.xml"];
const requiredFiles = [
  "taskpane.html",
  "src/main.tsx",
  "src/App.tsx",
  "src/services/api.ts",
  "src/services/word.ts",
  "src/services/office.ts",
  "src/components/office/OfficeContextCard.tsx",
  "src/components/office/ApprovalActions.tsx",
];
const authRouteFiles = [
  "../microsoft_auth.py",
  "../mercy-legal-web/src/app/api/auth/office/start/route.ts",
  "../mercy-legal-web/src/app/api/auth/office/callback/route.ts",
];
const taskpaneUrl = process.env.MERCY_ADDIN_TASKPANE_URL || "https://127.0.0.1:3000/taskpane.html";
const placeholderIds = new Set(["", "00000000-0000-0000-0000-000000000000"]);

function section(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function exists(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing ${relativePath}`);
    return false;
  }
  console.log(`PASS Found ${relativePath}`);
  return true;
}

function checkOfficeMatterIsReadOnly() {
  const source = fs.readFileSync(path.join(root, "src/services/api.ts"), "utf8");
  if (source.includes('/v1/matter/intake/full')) {
    fail("Office actions must not call full intake as a preflight because it can overwrite the selected matter.");
    return;
  }
  if (!source.includes("buildOfficeRequestContext") || !source.includes("office-ephemeral-context-1.0")) {
    fail("Office actions are missing the request-scoped, read-only matter context guard.");
    return;
  }
  console.log("PASS Word and Outlook actions keep selected matter metadata read-only");
}

function checkAttorneyApprovalBoundary() {
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const commands = fs.readFileSync(path.join(root, "src/commands.ts"), "utf8");
  const apiService = fs.readFileSync(path.join(root, "src/services/api.ts"), "utf8");
  const officeService = fs.readFileSync(path.join(root, "src/services/office.ts"), "utf8");
  const wordService = fs.readFileSync(path.join(root, "src/services/word.ts"), "utf8");
  const outlookManifest = fs.readFileSync(path.join(root, "manifest.outlook.xml"), "utf8");
  const allOfficeSource = `${app}\n${commands}\n${apiService}\n${officeService}\n${wordService}\n${outlookManifest}`;
  if (!app.includes("ApprovalActions") || !app.includes("applyApprovedOfficeText")) {
    fail("Task-pane output is missing the explicit preview and attorney-approval boundary.");
    return;
  }
  if (!commands.includes("confirmOfficeChange")) {
    fail("Ribbon commands can modify Office content without explicit approval.");
    return;
  }
  if (
    !commands.includes("confirmMatterCapture") ||
    !commands.includes("office_document_context_saved") ||
    commands.includes('runSkillCommand("update_matter_context"')
  ) {
    fail("The Word Update Matter command does not use an approved, live-only history capture boundary.");
    return;
  }
  if (/\.send\s*\(|ItemSend|OnMessageSend/i.test(allOfficeSource)) {
    fail("Outlook code must not send messages or register an automatic send event.");
    return;
  }
  console.log("PASS Word replacements and Outlook draft writes require approval; no send capability is present");
}

function checkOutlookMatterCaptureBoundary() {
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const apiService = fs.readFileSync(path.join(root, "src/services/api.ts"), "utf8");
  const requiredApprovalTokens = [
    "Approve save to matter",
    "explicit_save_to_matter_action",
    "Save canceled. Nothing was added to the matter.",
  ];
  if (requiredApprovalTokens.some((token) => !app.includes(token))) {
    fail("Outlook matter capture is missing exact-output approval or cancel-without-write messaging.");
    return;
  }
  if (!apiService.includes("office_capture") || !apiService.includes("attorney_approved")) {
    fail("Outlook matter capture does not send structured approval provenance to the core.");
    return;
  }
  if (
    !apiService.includes('NON_REPLAYABLE_AGENT_ACTIONS = new Set(["update_matter_context"])') ||
    !apiService.includes("allowOfflineQueue: false") ||
    !apiService.includes("discardNonReplayableQueuedMutations")
  ) {
    fail("State-changing Outlook matter capture can be cached, queued, or replayed without fresh approval.");
    return;
  }
  if (!app.includes("Correspondence was not saved") || !app.includes('cacheStatus !== "live"')) {
    fail("Outlook matter capture can claim success for an offline, queued, or failed write.");
    return;
  }
  if (!app.includes('history_event !== "office_correspondence_saved"') || !app.includes('captureResult?.status !== "pass"')) {
    fail("Outlook matter capture does not verify the core-confirmed history event before reporting success.");
    return;
  }
  console.log("PASS Outlook matter capture requires preview-based approval, is live-only, and verifies the saved history event");
}

function checkOutlookWorkflowFoundation() {
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const officeService = fs.readFileSync(path.join(root, "src/services/office.ts"), "utf8");
  const manifest = fs.readFileSync(path.join(root, "manifest.outlook.xml"), "utf8");
  const requiredWorkflowTokens = ["runSummarize", "runTriage", "runReply", "runSaveToMatter"];
  const requiredContextTokens = ["subject", "sender", "recipients", "attachmentNames", "outlook-compose"];
  if (requiredWorkflowTokens.some((token) => !app.includes(token))) {
    fail("Outlook is missing summary, triage, reply, or matter-save workflow wiring.");
    return;
  }
  if (requiredContextTokens.some((token) => !officeService.includes(token))) {
    fail("Outlook context capture is missing message metadata or compose/read mode detection.");
    return;
  }
  if (!manifest.includes("Taskpane.Reply.Url") || !manifest.includes("prompt=reply")) {
    fail("Outlook ribbon draft action does not open the preview-first reply task pane.");
    return;
  }
  console.log("PASS Outlook summary, triage, reply-preview, matter-save, and metadata context are wired");
}

function validateManifest(manifest) {
  try {
    const command =
      process.platform === "win32"
        ? ["cmd.exe", ["/d", "/s", "/c", `npx office-addin-manifest validate ${manifest}`]]
        : ["npx", ["office-addin-manifest", "validate", manifest]];
    const output = execFileSync(command[0], command[1], { cwd: root, stdio: "pipe", encoding: "utf8" });
    if (output.includes("The manifest is not valid.")) {
      throw new Error(output);
    }
    console.log(`PASS ${manifest} validates`);
  } catch (error) {
    fail(`${manifest} validation failed\n${String(error.stdout || error.message)}`);
  }
}

function webApplicationInfo(manifest) {
  const source = fs.readFileSync(path.join(root, manifest), "utf8");
  const block = source.match(/<WebApplicationInfo>[\s\S]*?<\/WebApplicationInfo>/)?.[0] || "";
  return {
    id: block.match(/<Id>([^<]+)<\/Id>/)?.[1]?.trim() || "",
    resource: block.match(/<Resource>([^<]+)<\/Resource>/)?.[1]?.trim() || "",
    scopes: [...block.matchAll(/<Scope>([^<]+)<\/Scope>/g)].map((match) => match[1].trim()),
  };
}

function checkWebApplicationInfo(manifest) {
  const info = webApplicationInfo(manifest);
  const requiredScopes = ["openid", "profile", "access_as_user"];
  if (!info.id || !info.resource || requiredScopes.some((scope) => !info.scopes.includes(scope))) {
    fail(`${manifest} is missing WebApplicationInfo Id, Resource, or required openid/profile/access_as_user scopes.`);
    return;
  }
  const expectedClientId = (process.env.MICROSOFT_ENTRA_CLIENT_ID || "").trim();
  const expectedResource = (process.env.MICROSOFT_ENTRA_APPLICATION_ID_URI || "").trim();
  if (!placeholderIds.has(expectedClientId) && info.id !== expectedClientId) {
    fail(`${manifest} WebApplicationInfo Id ${info.id} does not match MICROSOFT_ENTRA_CLIENT_ID.`);
    return;
  }
  if (expectedResource && !expectedResource.includes("00000000-0000-0000-0000-000000000000") && info.resource !== expectedResource) {
    fail(`${manifest} WebApplicationInfo Resource ${info.resource} does not match MICROSOFT_ENTRA_APPLICATION_ID_URI.`);
    return;
  }
  console.log(`PASS ${manifest} WebApplicationInfo includes required scopes and matches configured Entra values when provided`);
}

function checkTaskpane(url) {
  return new Promise((resolve) => {
    const request = https.get(
      url,
      {
        rejectUnauthorized: false,
        timeout: 5000,
      },
      (response) => {
        const ok = response.statusCode && response.statusCode >= 200 && response.statusCode < 400;
        console.log(`${ok ? "PASS" : "FAIL"} Task pane URL ${url} returned ${response.statusCode}`);
        if (!ok) process.exitCode = 1;
        response.resume();
        resolve();
      },
    );
    request.on("timeout", () => {
      request.destroy();
      fail(`Task pane URL ${url} timed out`);
      resolve();
    });
    request.on("error", (error) => {
      fail(`Task pane URL ${url} is not reachable: ${error.message}`);
      resolve();
    });
  });
}

function printChecklist() {
  section("Manual Word Smoke Checklist");
  console.log("1. Run npm run dev in mercy-legal-plugin and sideload manifest.xml in Word.");
  console.log("2. Open the Mercy task pane at a realistic 320-420px width and confirm the compact Mercy context, workflow, response, and approval cards.");
  console.log("3. Confirm auth handoff: Mercy tries Microsoft Office SSO first, then falls back to the Supabase PKCE dialog.");
  console.log("4. Before enterprise pilots, pre-authorize Office client applications for the Entra access_as_user scope.");
  console.log("5. Select matter context from the matter selector, then run Analyze, Draft, Cite, and Ethics.");
  console.log("6. Confirm Draft, Redline, and Report show a preview; the document changes only after Replace selection or Append report is approved.");
  console.log("7. Select safe sample text and run Update Matter; approve the capture, confirm the document is unchanged, and verify the Word context event appears only in the selected matter history.");
  console.log("8. For each response, confirm Reliability Panel shows route, confidence, guardrails, citations, attorney review, LangSmith trace, and D.C. grounding.");

  section("Manual Outlook Smoke Checklist");
  console.log("1. Run npm run dev in mercy-legal-plugin and sideload manifest.outlook.xml in Outlook.");
  console.log("2. Open a message or compose window, then launch Mercy Legal AI from the task pane command.");
  console.log("3. Confirm the context card reports read/compose mode, subject, sender/recipients, attachment names, and selection/body source without reading attachment content.");
  console.log("4. Run Summarize thread and Triage email; confirm facts, deadlines, requests, obligations, risks, and follow-up are reviewable.");
  console.log("5. Run Draft reply in a read item; confirm Write to draft is disabled and Copy remains available.");
  console.log("6. Run Draft reply in a reply/compose window; approve Write to draft, confirm only the draft changes, then verify Mercy never sends it.");
  console.log("7. Select a matter and approve Save to matter; confirm the correspondence event appears only in that tenant/matter history.");
  console.log("8. With the core offline, retry Save to matter; confirm Mercy reports not saved, queues nothing, and reconnecting does not replay the write.");
  console.log("9. Confirm Reliability Panel remains visible for every Mercy response and auth handoff behaves like Word.");
}

section("Office Add-in Static Smoke");
for (const file of [...manifests, ...requiredFiles]) {
  exists(file);
}
for (const file of authRouteFiles) {
  if (fs.existsSync(path.resolve(root, file))) {
    console.log(`PASS Found ${file}`);
  } else {
    fail(`Missing ${file}`);
  }
}
checkOfficeMatterIsReadOnly();
checkAttorneyApprovalBoundary();
checkOutlookMatterCaptureBoundary();
checkOutlookWorkflowFoundation();
for (const manifest of manifests) {
  validateManifest(manifest);
  checkWebApplicationInfo(manifest);
}

if (args.has("--check-server")) {
  await checkTaskpane(taskpaneUrl);
}

printChecklist();

if (process.exitCode) {
  console.log("\nOffice add-in smoke result: FAIL");
} else {
  console.log("\nOffice add-in smoke result: PASS");
}
