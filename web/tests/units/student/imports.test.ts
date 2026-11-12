import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../../../src");
const ROUTER = readFileSync(resolve(SRC, "app/router.tsx"), "utf8");

function fileOf(specifier: string, from: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = resolve(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;
  for (const tail of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const path = base + tail;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

function routesOf(tree: string): string[] {
  const start = ROUTER.indexOf(`const ${tree}: RouteObject = {`);
  const end = ROUTER.indexOf("\n};", start);
  if (start < 0 || end < 0) throw new Error(`no ${tree} in the router`);
  return [...ROUTER.slice(start, end).matchAll(/import\("([^"]+)"\)/g)].map((match) =>
    fileOf(match[1]!, resolve(SRC, "app/router.tsx"))!,
  );
}

const named = (paths: Iterable<string>) =>
  [...paths].map((path) => relative(SRC, path)).sort((a, b) => a.localeCompare(b));

describe("what the student routes import", () => {
  const student = [...routesOf("studentTree"), ...routesOf("takeTestTree")];

  it("walks every route the router declares under /app", () => {
    const declared = ROUTER.matchAll(
      /(?:const (\w+): RouteObject = \{\s*)?\bpath: "app[/"]/g,
    );
    expect([...declared].map((match) => match[1])).toEqual([
      "studentTree",
      "takeTestTree",
    ]);
  });

  it("starts from the shell, its pages and the engine", () => {
    expect(named(student)).toEqual(
      expect.arrayContaining([
        "features/assignments/pages/AssignmentIntroPage.tsx",
        "features/assignments/pages/StudentHomePage.tsx",
        "features/auth/pages/StudentSettingsPage.tsx",
        "features/classes/pages/StudentClassesPage.tsx",
        "features/results/pages/ResultPage.tsx",
        "features/take-test/pages/TakeTestPage.tsx",
        "layouts/FocusLayout.tsx",
        "layouts/StudentLayout.tsx",
      ]),
    );
  });
});
