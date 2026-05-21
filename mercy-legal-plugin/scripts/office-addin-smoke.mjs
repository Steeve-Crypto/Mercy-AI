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
const requiredFiles = ["taskpane.html", "src/main.tsx", "src/App.tsx", "src/services/api.ts", "src/services/word.ts"];
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
  console.log("2. Open the Mercy task pane and confirm the native grey sidebar, purple accents, and Mercy branding.");
  console.log("3. Confirm auth handoff: Mercy tries Microsoft Office SSO first, then falls back to the Supabase PKCE dialog.");
  console.log("4. Before enterprise pilots, pre-authorize Office client applications for the Entra access_as_user scope.");
  console.log("5. Select matter context from the matter selector, then run Analyze, Draft, Cite, and Ethics.");
  console.log("6. For each response, confirm Reliability Panel shows route, confidence, guardrails, citations, attorney review, LangSmith trace, and D.C. grounding.");

  section("Manual Outlook Smoke Checklist");
  console.log("1. Run npm run dev in mercy-legal-plugin and sideload manifest.outlook.xml in Outlook.");
  console.log("2. Open a message or compose window, then launch Mercy Legal AI from the task pane command.");
  console.log("3. Select message text and run Analyze; confirm selected text is used or the message body fallback is used gracefully.");
  console.log("4. Run Draft, Cite, and Ethics against the selected matter context.");
  console.log("5. Confirm Reliability Panel remains visible for every Mercy response and auth handoff behaves like Word.");
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
