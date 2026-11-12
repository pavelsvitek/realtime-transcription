import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 3001 },
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({
      // The site is static: prerender every page at build time.
      prerender: { enabled: true, crawlLinks: false },
      pages: [{ path: "/" }, { path: "/privacy" }, { path: "/terms" }, { path: "/support" }],
    }),
    viteReact(),
  ],
});
