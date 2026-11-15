import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build, type Plugin } from "vite";
import { beforeAll, describe, expect, it } from "vitest";
import { SURFACES, type Surface } from "@/lib/i18n/surfaces";

/**
 * T-R11.12a: the strings are split by surface, and a route tree renders only
 * after its surfaces are loaded (`page` in `app/router.tsx`). This test reads
 * which modules each tree renders from the build's module graph, finds the
 * keys those modules name, and fails when one is in neither `common` nor a
 * surface the tree loads. What the entry chunk renders (the splash, the
 * maintenance page, the error and not-found pages, the guards) is drawn before
 * any surface, so its keys are in `common`, and so is a key two audiences
 * render: the fix for a failure here is to move the key, never to load more.
 *
 * A key is named by a string literal that is a key, or the stem of a plural,
 * or a tree of keys (`"assignments.reviewRules"`, read whole or by a key built
 * on it), or by the fixed head of a template (`` `dashboard.status.${s}` ``),
 * which names every key it may complete.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const SRC = `${ROOT}/src/`;
const ROUTER = `${SRC}app/router.tsx`;

type Tree = "auth" | "student" | "teacher" | "admin";
const LOADS: Record<Tree, readonly Surface[]> = {
  auth: ["auth"],
  student: ["student"],
  teacher: ["teacher"],
  admin: ["teacher", "admin"],
};

/** The router's declarations, each with the tree its routes belong to. */
const SECTIONS: Record<string, Tree> = {
  authRoutes: "auth",
  joinRoutes: "student",
  teacherTree: "teacher",
  ADMIN_CRUMB: "admin",
  adminTree: "admin",
  studentTree: "student",
  takeTestTree: "student",
  routesFor: "auth", // the one page it imports itself: /change-password
};

type Node = { imports: string[]; dynamic: string[] };
const graph = new Map<string, Node>();

beforeAll(async () => {
  const record: Plugin = {
    name: "record-module-graph",
    buildEnd() {
      for (const id of this.getModuleIds()) {
        const info = this.getModuleInfo(id);
        if (info)
          graph.set(id, {
            imports: [...info.importedIds],
            dynamic: [...info.dynamicallyImportedIds],
          });
      }
    },
  };
  await build({
    root: ROOT,
    configFile: resolve(ROOT, "vite.config.ts"),
    logLevel: "silent",
    build: { write: false },
    plugins: [record],
  });
}, 120_000);

// --- the strings --------------------------------------------------------

const surfaceOf = new Map<string, string>();
for (const surface of ["common", ...SURFACES]) {
  const walk = (node: unknown, path: string[]) => {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === "object" && value !== null) walk(value, [...path, key]);
      else surfaceOf.set([...path, key].join("."), surface);
    }
  };
  walk(
    JSON.parse(readFileSync(`${SRC}lib/i18n/locales/en/${surface}.json`, "utf8")),
    [],
  );
}
const leaves = [...surfaceOf.keys()];
const stem = (key: string) => key.replace(/_(one|other)$/, "");
const stems = new Map<string, string[]>();
for (const leaf of leaves)
  stems.set(stem(leaf), [...(stems.get(stem(leaf)) ?? []), leaf]);

/** The keys a source text names, each with the leaves it may read. */
function named(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const under = (head: string) => leaves.filter((leaf) => leaf.startsWith(head));
  for (const [, literal] of text.matchAll(
    /["'`]([A-Za-z][\w-]*(?:\.[\w$-]+)+)["'`]/g,
  )) {
    const exact = stems.get(literal!);
    if (exact) out.set(literal!, exact);
    else {
      const tree = under(`${literal}.`);
      if (tree.length) out.set(`${literal}.*`, tree);
    }
  }
  for (const [, head] of text.matchAll(/`([A-Za-z][\w-]*(?:\.[\w-]+)*\.?)\$\{/g)) {
    if (!head!.includes(".")) continue;
    const tree = under(head!);
    if (tree.length) out.set(`${head}*`, tree);
  }
  return out;
}

// --- the trees ------------------------------------------------------------

const moduleOf = (path: string) => {
  const id = [...graph.keys()].find((key) => key.startsWith(`${SRC}${path}.`));
  if (!id) throw new Error(`no module for @/${path} in the build`);
  return id;
};

function routerSections(): { tree: Tree; body: string }[] {
  const source = readFileSync(ROUTER, "utf8");
  const starts = [...source.matchAll(/^(?:export )?(?:const|function) (\w+)/gm)];
  return starts.flatMap((match, index) => {
    const tree = SECTIONS[match[1]!];
    const body = source.slice(match.index, starts[index + 1]?.index ?? source.length);
    if (!tree) {
      expect(body, `router.tsx: ${match[1]} imports a page no tree claims`).not.toMatch(
        /import\("@\//,
      );
      return [];
    }
    return [{ tree, body }];
  });
}

function reach(starts: string[], dynamic: boolean, stops: Set<string>): Set<string> {
  const seen = new Set<string>();
  const pending = [...starts];
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id) || (stops.has(id) && !starts.includes(id))) continue;
    seen.add(id);
    const node = graph.get(id);
    if (node) pending.push(...node.imports, ...(dynamic ? node.dynamic : []));
  }
  return seen;
}

function readSource(id: string): string | null {
  if (!id.startsWith(SRC) || id === ROUTER || id.includes("/features/landing/"))
    return null;
  return /\.(ts|tsx)$/.test(id) ? readFileSync(id, "utf8") : null;
}

type Use = { key: string; leaves: string[]; file: string };

function usesIn(modules: Iterable<string>): Use[] {
  return [...modules].flatMap((id) => {
    const text = readSource(id);
    if (text === null) return [];
    return [...named(text)].map(([key, read]) => ({
      key,
      leaves: read,
      file: id.slice(SRC.length),
    }));
  });
}

/** Each use whose keys are outside the surfaces given, as `key (surface) in file`. */
function outside(uses: Use[], surfaces: readonly string[]): string[] {
  const allowed = new Set(["common", ...surfaces]);
  return uses.flatMap(({ key, leaves: read, file }) =>
    read
      .filter((leaf) => !allowed.has(surfaceOf.get(leaf)!))
      .map((leaf) => `${leaf} (${surfaceOf.get(leaf)}) named as ${key} in ${file}`),
  );
}

describe("the strings a route tree renders", () => {
  it("are in common for the entry chunk", () => {
    const entry = reach([moduleOf("main")], false, new Set());
    const uses = usesIn(entry);
    expect(uses.length).toBeGreaterThan(50);
    expect(outside(uses, [])).toEqual([]);
  });

  it("are in common or a surface the tree loads, for every tree", () => {
    const sections = routerSections();
    const roots = new Map<Tree, string[]>();
    for (const { tree, body } of sections)
      for (const [, path] of body.matchAll(/import\("@\/([^"]+)"\)/g))
        roots.set(tree, [...(roots.get(tree) ?? []), moduleOf(path!)]);
    const pages = new Set([...roots.values()].flat());
    expect([...roots.keys()].sort((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(LOADS).sort((a, b) => a.localeCompare(b)),
    );

    const failures: string[] = [];
    for (const [tree, starts] of roots) {
      // A page's prefetch of another tree's page is not something it renders.
      const modules = reach(starts, true, pages);
      const uses = usesIn(modules);
      for (const { tree: owner, body } of sections)
        if (owner === tree)
          for (const [, key] of body.matchAll(/(?:key|titleKey): "([^"]+)"/g))
            uses.push({
              key: key!,
              leaves: stems.get(key!) ?? [],
              file: "app/router.tsx",
            });
      expect(uses.length, tree).toBeGreaterThan(20);
      failures.push(...outside(uses, LOADS[tree]).map((line) => `${tree}: ${line}`));
    }
    expect(failures).toEqual([]);
  });

  it("are read by the router's crumbs and titles from keys that exist", () => {
    const missing = routerSections().flatMap(({ body }) =>
      [...body.matchAll(/(?:key|titleKey): "([^"]+)"/g)]
        .map(([, key]) => key!)
        .filter((key) => !stems.has(key)),
    );
    expect(missing).toEqual([]);
  });
});
