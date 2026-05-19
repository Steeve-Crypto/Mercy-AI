#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const playwrightArgs = args.length ? args : ["--workers=4"];

process.env.PLAYWRIGHT_WEB_PORT ||= "3100";
process.env.PLAYWRIGHT_BASE_URL ||= `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT}`;
process.env.MERCY_ENV ||= "local";
process.env.MERCY_AUTH_MODE ||= "dev";
process.env.MERCY_API_TOKEN ||= "playwright-local-token";
process.env.MERCY_CORE_API_TOKEN ||= process.env.MERCY_API_TOKEN;
process.env.MERCY_TENANT_ID ||= "playwright-tenant";
process.env.MERCY_USER_ID ||= "playwright-user";
process.env.MERCY_ROLES ||= "attorney";
process.env.NEXT_PUBLIC_MERCY_TENANT_ID ||= process.env.MERCY_TENANT_ID;
process.env.NEXT_PUBLIC_MERCY_USER_ID ||= process.env.MERCY_USER_ID;
process.env.NEXT_PUBLIC_MERCY_API_TOKEN ||= process.env.MERCY_API_TOKEN;
process.env.NEXT_PUBLIC_MERCY_CORE_API_URL ||= "http://127.0.0.1:8000";
process.env.MERCY_CORE_API_URL ||= process.env.NEXT_PUBLIC_MERCY_CORE_API_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "";

function cleanupWindowsServer() {
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(__dirname, "cleanup-e2e-server.ps1"),
    ],
    {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
    },
  );
}

function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
        } else if (Date.now() - started > timeoutMs) {
          reject(new Error(`Server at ${url} returned ${response.statusCode} until timeout`));
        } else {
          setTimeout(check, 1000);
        }
      });
      request.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`));
        } else {
          setTimeout(check, 1000);
        }
      });
      request.setTimeout(3000, () => {
        request.destroy();
      });
    };
    check();
  });
}

function quoteForCmd(value) {
  const text = String(value);
  return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const command = process.platform === "win32" ? "cmd.exe" : "npx";
const commandArgs =
  process.platform === "win32"
    ? ["/d", "/s", "/c", ["npx", "playwright", "test", ...playwrightArgs].map(quoteForCmd).join(" ")]
    : ["playwright", "test", ...playwrightArgs];

const server = spawn(
  process.execPath,
  [
    "./node_modules/next/dist/bin/next",
    "dev",
    "--turbopack",
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.PLAYWRIGHT_WEB_PORT,
  ],
  {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: "ignore",
  },
);
server.unref();

let result = { status: 1 };
try {
  await waitForServer(process.env.PLAYWRIGHT_BASE_URL);
  result = spawnSync(command, commandArgs, {
    cwd: root,
    env: {
      ...process.env,
      PLAYWRIGHT_EXTERNAL_SERVER: "1",
    },
    stdio: "inherit",
    shell: false,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (process.platform === "win32") {
    cleanupWindowsServer();
  } else if (server.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // Best-effort cleanup for non-Windows local runs.
    }
  }
}

process.exit(result.status ?? 1);
