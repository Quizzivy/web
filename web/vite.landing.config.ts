import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { appVersion } from "./vite.config.ts";

const ROOT = import.meta.dirname;
const OUT = "dist-landing";
const PAGE = "landing.html";

/**
 * landingIndex makes landing.html the index of the landing site, which is a
 * build output of its own beside the app's (docs/deploy.md): the dev server
 * answers every page of the site with it, and the build writes it as
 * index.html, which a static host serves at `/` and for any path it has no
 * file for.
 */
function landingIndex(): Plugin {
  return {
    name: "quizzivy:landing-index",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const pathname = (request.url ?? "/").split("?")[0] ?? "/";
        const wantsPage = request.headers.accept?.includes("text/html") ?? false;
        if (wantsPage && path.extname(pathname) === "") request.url = `/${PAGE}`;
        next();
      });
    },
    closeBundle() {
      const built = path.resolve(ROOT, OUT, PAGE);
      if (existsSync(built)) renameSync(built, path.resolve(ROOT, OUT, "index.html"));
    },
  };
}

/**
 * The landing site's build: quizzivy.com's own pages, from
 * src/features/landing, into dist-landing. It shares the app's sources, its
 * tokens and its public files, and none of its entry: no session, no API
 * client, no app strings. `VITE_` values are read as the app's build reads
 * them, from the repository's one .env.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), appVersion(), landingIndex()],
  envDir: path.resolve(ROOT, ".."),
  envPrefix: ["VITE_"],
  resolve: { alias: { "@": path.resolve(ROOT, "./src") } },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(ROOT, PAGE) },
  },
  server: { port: 5176, host: "localhost" },
  preview: { port: 4176, host: "localhost" },
});
