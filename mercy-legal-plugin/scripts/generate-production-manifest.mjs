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

if (/localhost|127\.0\.0\.1|\[::1\]/i.test(baseUrl)) {
  console.error("Production URL must not point at localhost.");
  process.exit(1);
}

let origin;
try {
  const parsed = new URL(baseUrl);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    console.error("Production URL must be an origin only, for example: https://addin.mercylegal.ai");
    process.exit(1);
  }
  origin = parsed.origin;
} catch {
  console.error("Production URL must be a valid HTTPS origin, for example: https://addin.mercylegal.ai");
  process.exit(1);
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distPath = resolve(root, "dist");
const devBaseUrl = "https://localhost:3000";

// Generate production manifests for both Word and Outlook by replacing the dev base URL.
// Source manifests (with localhost) remain for local dev sideloading against `npm run dev`.
const manifests = [
  { src: "manifest.xml", out: "manifest.xml" },
  { src: "manifest.outlook.xml", out: "manifest.outlook.xml" },
];

mkdirSync(distPath, { recursive: true });

for (const m of manifests) {
  const srcPath = resolve(root, m.src);
  const outPath = resolve(distPath, m.out);
  const content = readFileSync(srcPath, "utf8").replaceAll(devBaseUrl, origin);
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(content)) {
    console.error(`Generated ${m.out} still contains a localhost reference. Refusing to write production manifest.`);
    process.exit(1);
  }
  writeFileSync(outPath, content);
  console.log(`Generated ${outPath}`);
}

console.log(`Production base URL for hosted assets (taskpane.html, icons, built JS): ${origin}`);
console.log("Upload the entire dist/ folder to this origin root so that https://your-domain/taskpane.html serves the built add-in.");
