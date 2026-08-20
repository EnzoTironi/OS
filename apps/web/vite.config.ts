import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), viteReact(), nitroV2Plugin()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.ZOEN_E2E_WEB_PORT ?? "3000"),
  },
});
