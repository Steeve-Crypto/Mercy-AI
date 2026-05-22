import { build } from "vite";
import configFactory from "../vite.config.mjs";

const config = await configFactory({ command: "build", mode: process.env.NODE_ENV || "production" });
await build(config);
