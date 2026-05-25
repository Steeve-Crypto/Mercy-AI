import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(async ({ command }) => {
  const httpsOptions =
    command === "serve"
      ? await import("office-addin-dev-certs").then(({ getHttpsServerOptions }) => getHttpsServerOptions())
      : undefined;

  return {
    configFile: false,
    root: __dirname,
    plugins: [react()],
    server: {
      ...(httpsOptions ? { https: httpsOptions } : {}),
      host: "127.0.0.1",
      port: 3000,
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
          taskpane: resolve(__dirname, "taskpane.html"),
          commands: resolve(__dirname, "commands.html"),
          support: resolve(__dirname, "support.html"),
        },
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            fluent: ["@fluentui/react-components", "@fluentui/react-icons"],
          },
        },
      },
    },
  };
});
