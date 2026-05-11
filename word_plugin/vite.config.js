import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    https: true,
    host: "127.0.0.1",
    port: 3000,
  },
});
