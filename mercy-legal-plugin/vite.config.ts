import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { getHttpsServerOptions } from "office-addin-dev-certs";
import { resolve } from "node:path";

export default defineConfig(async () => {
  const httpsOptions = await getHttpsServerOptions();

  return {
    plugins: [react()],
    server: {
      https: httpsOptions,
      host: "127.0.0.1",
      port: 3000
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
          taskpane: resolve(__dirname, "taskpane.html"),
          commands: resolve(__dirname, "commands.html"),
          support: resolve(__dirname, "support.html")
        },
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            fluent: ["@fluentui/react-components", "@fluentui/react-icons"]
          }
        }
      }
    }
  };
});
