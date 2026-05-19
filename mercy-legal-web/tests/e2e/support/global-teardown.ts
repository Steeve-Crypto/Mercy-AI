import { execFileSync } from "node:child_process";
import path from "node:path";

async function globalTeardown() {
  if (process.platform !== "win32" || process.env.CI) {
    return;
  }

  const cleanupScript = path.resolve(__dirname, "../../../scripts/cleanup-e2e-server.ps1");
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", cleanupScript],
    {
      cwd: path.resolve(__dirname, "../../.."),
      stdio: "inherit",
      env: process.env,
    },
  );
}

export default globalTeardown;
