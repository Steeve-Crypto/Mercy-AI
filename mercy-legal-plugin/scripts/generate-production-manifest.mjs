import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const urlArgIndex = process.argv.indexOf("--url");
const rawUrl = urlArgIndex >= 0 ? process.argv[urlArgIndex + 1] : process.env.PROD_BASE_URL;

if (!rawUrl) {
  console.error("Missing production URL. Use: npm run manifest:prod -- --url https://your-domain.example");
  process.exit(1);
}

const baseUrl = rawUrl.replace(/\/+$/, "");

if (!/^https:\/\/[^/]+/i.test(baseUrl)) {
  console.error("Production URL must be an HTTPS origin, for example: https://app.mercylegal.ai");
  process.exit(1);
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(root, "manifest.xml");
const distPath = resolve(root, "dist");
const outputPath = resolve(distPath, "manifest.xml");

const devBaseUrl = "https://localhost:3000";
const manifest = readFileSync(manifestPath, "utf8").replaceAll(devBaseUrl, baseUrl);

mkdirSync(distPath, { recursive: true });
writeFileSync(outputPath, manifest);

console.log(`Generated ${outputPath}`);
console.log(`Production base URL: ${baseUrl}`);
