import { appendFileSync, existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { appVersion } from "./vite.config.ts";

const ROOT = import.meta.dirname;
const ENV_DIR = path.resolve(ROOT, "..");
const OUT = "dist-landing";
const PAGE = "landing.html";
const HEADERS = "landing.headers";

/** The pages a search engine is told of: the Landing and the privacy notice. */
const LISTED = ["/", "/privacy"];

function originOf(raw: string | undefined): string | null {
  let origin = raw?.trim() ?? "";
  while (origin.endsWith("/")) origin = origin.slice(0, -1);
  return origin === "" ? null : origin;
}

/**
 * landingSite makes landing.html the index of the landing site, which is a
 * build output of its own beside the app's (docs/deploy.md): the dev server
 * answers every page of the site with it, and the build writes it as
 * index.html, which a static host serves at `/` and for any path it has no
 * file for. The build also appends landing.headers to the app's _headers.
 *
 * `site` is the address the site is published at (`VITE_LANDING_URL`). With
 * it, the page names that address when its link is shared, and the build
 * writes a robots.txt and a sitemap.xml that name it, so the same pages on
 * another host of the Pages project never stand as the site's own. Without
 * it none of the three is written.
 */
function landingSite(site: string | null): Plugin {
  return {
    name: "quizzivy:landing-site",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const pathname = (request.url ?? "/").split("?")[0] ?? "/";
        const wantsPage = request.headers.accept?.includes("text/html") ?? false;
        if (wantsPage && path.extname(pathname) === "") request.url = `/${PAGE}`;
        next();
      });
    },
    transformIndexHtml() {
      if (site === null) return [];
      return [
        {
          tag: "meta",
          attrs: { property: "og:url", content: `${site}/` },
          injectTo: "head",
        },
      ];
    },
    generateBundle() {
      if (site === null) return;
      const urls = LISTED.map((page) => `  <url><loc>${site}${page}</loc></url>`);
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          "</urlset>",
          "",
        ].join("\n"),
      });
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`,
      });
    },
    closeBundle() {
      const built = path.resolve(ROOT, OUT, PAGE);
      if (!existsSync(built)) return;
      renameSync(built, path.resolve(ROOT, OUT, "index.html"));
      appendFileSync(
        path.resolve(ROOT, OUT, "_headers"),
        readFileSync(path.resolve(ROOT, HEADERS)),
      );
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
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    appVersion(),
    landingSite(originOf(loadEnv(mode, ENV_DIR, "VITE_")["VITE_LANDING_URL"])),
  ],
  envDir: ENV_DIR,
  envPrefix: ["VITE_"],
  resolve: { alias: { "@": path.resolve(ROOT, "./src") } },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(ROOT, PAGE) },
  },
  server: { port: 5176, host: "localhost" },
  preview: { port: 4176, host: "localhost" },
}));
