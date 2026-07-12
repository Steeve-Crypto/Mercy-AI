import { build } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import configFactory from "../vite.config.mjs";

const mode = "production";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(mode, root, "");

function requireHttpsProductionUrl(name) {
  const value = String(process.env[name] || env[name] || "").trim().replace(/\/+$/, "");
  if (!value) {
    throw new Error(`${name} is required for a production Office add-in build.`);
  }
  if (!/^https:\/\/[^/]+/i.test(value)) {
    throw new Error(`${name} must be an HTTPS URL for a production Office add-in build.`);
  }
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(value)) {
    throw new Error(`${name} must not point at localhost for a production Office add-in build.`);
  }
  return value;
}

requireHttpsProductionUrl("VITE_MERCY_CORE_API_URL");
requireHttpsProductionUrl("VITE_MERCY_WEB_AUTH_URL");

process.env.NODE_ENV = "production";

const config = await configFactory({ command: "build", mode });
await build(config);
