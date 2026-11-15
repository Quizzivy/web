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

/** Where landing.html names the centre: the build writes `VITE_ORG_NAME` there. */
const CENTRE = "%VITE_ORG_NAME%";

/**
 * What the page says where the build names no centre: the product's name, as
 * the site's own lines do (FALLBACK_ORG_NAME in src/features/landing/site.ts).
 */
const PRODUCT = "Quizzivy";

function originOf(raw: string | undefined): string | null {
  let origin = raw?.trim() ?? "";
  while (origin.endsWith("/")) origin = origin.slice(0, -1);
  return origin === "" ? null : origin;
}

function nameOf(raw: string | undefined): string {
  const name = raw?.trim() ?? "";
  return name === "" ? PRODUCT : name;
}

function inAttribute(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
 *
 * `centre` is the centre's name (`VITE_ORG_NAME`, or the product's name where
 * the build sets none). landing.html spells no name: the page's description
 * tags get this one, before Vite reads the page.
 */
function landingSite(site: string | null, centre: string): Plugin {
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
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return {
          html: html.replaceAll(CENTRE, () => inAttribute(centre)),
          tags:
            site === null
              ? []
              : [
                  {
                    tag: "meta",
                    attrs: { property: "og:url", content: `${site}/` },
                    injectTo: "head",
                  },
                ],
        };
      },
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
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, "VITE_");
  return {
    plugins: [
      react(),
      tailwindcss(),
      appVersion(),
      landingSite(originOf(env["VITE_LANDING_URL"]), nameOf(env["VITE_ORG_NAME"])),
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
  };
});
