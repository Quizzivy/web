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

/** The centre's name this build is given, with a character HTML has to escape. */
const CENTRE = "Sao Mai & Em English Centre";
const CENTRE_IN_HTML = "Sao Mai &amp; Em English Centre";

/** A centre's name, spelled, once the build's own is taken out. */
const NAMED = /\bCent(?:re|er)\b|Trung tâm (?:Anh|Ngoại) ngữ/;

let output: BuildOutput["output"];

async function buildSite(): Promise<BuildOutput["output"]> {
  const result = (await build({
    root: ROOT,
    configFile: resolve(ROOT, "vite.landing.config.ts"),
    logLevel: "silent",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: { conditions: ["module", "browser", "production"] },
    build: { write: false },
  })) as unknown as BuildOutput | BuildOutput[];
  return (Array.isArray(result) ? result[0]! : result).output;
}

beforeAll(async () => {
  process.env["VITE_LANDING_URL"] = SITE;
  process.env["VITE_ORG_NAME"] = CENTRE;
  output = await buildSite();
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

  const text = (fileName: string, from = output) => {
    const asset = from.find(
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

  const descriptions = (page: string) =>
    [
      ...page.matchAll(
        /<meta\s+(?:name="description"|property="og:description")\s+content="([^"]*)"/g,
      ),
    ].map((match) => match[1]!);

  // Fails when the page or a chunk spells a centre's name, or the page's tags stop taking the build's (Quizzivy/web#103).
  it("names the centre by the build's VITE_ORG_NAME, in the page's tags and in the code", () => {
    expect(readFileSync(resolve(ROOT, "landing.html"), "utf8")).not.toMatch(NAMED);

    const page = text("landing.html");
    const written = descriptions(page);
    expect(written).toHaveLength(2);
    for (const description of written) {
      expect(description).toContain(
        `Quizzivy là hệ thống kiểm tra trực tuyến của ${CENTRE_IN_HTML}. `,
      );
    }
    expect(page.split(CENTRE_IN_HTML).join("")).not.toMatch(NAMED);
    expect(page).not.toContain("%VITE_");

    const code = chunks()
      .map((chunk) => chunk.code)
      .join("\n");
    expect(code).toContain(CENTRE);
    expect(code.split(CENTRE).join("")).not.toMatch(/English Cent(?:re|er)/);
  });

  // Fails when a build that names no centre writes anything but the product's name in the page's tags.
  it("says Quizzivy in the page's tags where the build names no centre", async () => {
    process.env["VITE_ORG_NAME"] = "";
    try {
      const page = text("landing.html", await buildSite());
      const written = descriptions(page);
      expect(written).toHaveLength(2);
      for (const description of written) {
        expect(description).toContain(
          "Quizzivy là hệ thống kiểm tra trực tuyến của Quizzivy. ",
        );
      }
      expect(page).not.toMatch(NAMED);
      expect(page).not.toContain("%VITE_");
    } finally {
      process.env["VITE_ORG_NAME"] = CENTRE;
    }
  }, 120_000);

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
