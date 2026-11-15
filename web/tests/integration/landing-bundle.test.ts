import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

type OutputChunk = {
  type: "chunk";
  isEntry: boolean;
  fileName: string;
  moduleIds: readonly string[];
  imports: string[];
  dynamicImports: string[];
  code: string;
};
type OutputAsset = { type: "asset"; fileName: string; source: string | Uint8Array };
type BuildOutput = { output: (OutputAsset | OutputChunk)[] };

/**
 * The landing site is a build of its own (vite.landing.config.ts), so that a
 * stranger opening quizzivy.com on a phone downloads the site and nothing of
 * the app. Built into the app's bundle it took 326 KiB of JavaScript, gzip,
 * to open the Landing; R11's plan caps it at 200 KB.
 */
const ROOT = resolve(import.meta.dirname, "../..");
const LIMIT = 200 * 1000;
const SITE = "https://quizzivy.com";

let output: BuildOutput["output"];

beforeAll(async () => {
  process.env["VITE_LANDING_URL"] = SITE;
  const result = (await build({
    root: ROOT,
    configFile: resolve(ROOT, "vite.landing.config.ts"),
    logLevel: "silent",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: { conditions: ["module", "browser", "production"] },
    build: { write: false },
  })) as unknown as BuildOutput | BuildOutput[];
  output = (Array.isArray(result) ? result[0]! : result).output;
}, 120_000);

const chunks = () =>
  output.filter((item): item is OutputChunk => item.type === "chunk");

function reached(roots: readonly OutputChunk[], dynamic: boolean): OutputChunk[] {
  const byName = new Map(chunks().map((chunk) => [chunk.fileName, chunk]));
  const seen = new Map<string, OutputChunk>();
  const pending = [...roots];
  while (pending.length) {
    const chunk = pending.pop()!;
    if (seen.has(chunk.fileName)) continue;
    seen.set(chunk.fileName, chunk);
    for (const name of [...chunk.imports, ...(dynamic ? chunk.dynamicImports : [])]) {
      const dependency = byName.get(name);
      if (dependency) pending.push(dependency);
    }
  }
  return [...seen.values()];
}

const entry = () => chunks().filter((chunk) => chunk.isEntry);
const modules = (list: readonly OutputChunk[]) =>
  list.flatMap((chunk) => chunk.moduleIds.map((id) => id.replace(/\\/g, "/")));

describe("the landing site's build", () => {
  it("opens the Landing within the plan's 200 KB of JavaScript, gzip", () => {
    const first = reached(entry(), false);
    const bytes = first.reduce(
      (total, chunk) => total + gzipSync(chunk.code).byteLength,
      0,
    );
    expect(first.length).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(LIMIT);
  });

  it("holds the Landing with the entry, and the notice, the status page and English behind it", () => {
    const first = modules(reached(entry(), false));
    expect(first.some((id) => id.includes("features/landing/pages/LandingPage"))).toBe(
      true,
    );
    expect(first.some((id) => id.includes("features/landing/locales/vi.json"))).toBe(
      true,
    );
    for (const later of [
      "features/landing/pages/PrivacyPage",
      "features/landing/pages/StatusPage",
      "features/landing/pages/NotFoundPage",
      "features/landing/locales/en.json",
    ]) {
      expect(
        first.some((id) => id.includes(later)),
        later,
      ).toBe(false);
      expect(
        modules(reached(entry(), true)).some((id) => id.includes(later)),
        later,
      ).toBe(true);
    }
  });

  it("carries nothing of the app: no session, no API client, no app strings, no console", () => {
    const APP =
      /\/src\/(stores\/|lib\/api\/client|lib\/i18n\/(index|locales\/)|lib\/organization|app\/(?!pages\/errorArt)|layouts\/|features\/(?!landing\/|join\/code))/;
    const all = modules(reached(entry(), true));
    expect(all.filter((id) => APP.test(id))).toEqual([]);
    expect(
      all.filter((id) => /react-router|@tanstack|@tiptap|@dnd-kit/.test(id)),
    ).toEqual([]);
  });

  it("writes a version.json beside the page, as the app's build does", () => {
    const files = output.map((item) => item.fileName);
    expect(files).toContain("version.json");
  });

  const text = (fileName: string) => {
    const asset = output.find(
      (item): item is OutputAsset =>
        item.type === "asset" && item.fileName === fileName,
    );
    if (!asset) throw new Error(`the build wrote no ${fileName}`);
    return typeof asset.source === "string"
      ? asset.source
      : new TextDecoder().decode(asset.source);
  };

  it("names the site's published address in robots.txt, the sitemap and the page's share tag", () => {
    expect(text("robots.txt")).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
    );
    const listed = [...text("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    );
    expect(listed).toEqual([`${SITE}/`, `${SITE}/privacy`]);
    expect(text("landing.html")).toContain(
      `<meta property="og:url" content="${SITE}/">`,
    );
  });

  it("keeps the Pages project's own hosts out of search results, and no other host", () => {
    const rules = readFileSync(resolve(ROOT, "landing.headers"), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.startsWith("#"));
    expect(rules).toEqual([
      "https://:project.pages.dev/*",
      "  X-Robots-Tag: noindex",
      "https://:version.:project.pages.dev/*",
      "  X-Robots-Tag: noindex",
    ]);
  });
});
