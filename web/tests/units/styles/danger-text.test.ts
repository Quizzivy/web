import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../../../src");

/** The two icons drawn in `danger`, which need 3:1 and have it. */
const ICONS = [
  "components/shared/stats/KpiTile.tsx",
  "features/integrity/useClipboardNotice.ts",
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * Quizzivy/web#107: `danger` as text is 4.15:1 on the page in the dark theme
 * and 3.95:1 on a card. Words in the danger colour are `danger-ink`; only the
 * icons above keep `danger`.
 */
it("sets every word in the danger colour in danger-ink", () => {
  const offenders = sources(SRC).flatMap((path) => {
    const file = relative(SRC, path);
    if (ICONS.includes(file)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .flatMap((line, index) =>
        /\btext-(destructive|danger)(?![\w-])/.test(line)
          ? [`${file}:${index + 1}`]
          : [],
      );
  });
  expect(offenders).toEqual([]);
});

it("leaves the form dialog's danger button in the destructive variant's own colours", () => {
  const dialog = readFileSync(
    join(SRC, "components/shared/form/FormDialog.tsx"),
    "utf8",
  );
  expect(dialog).not.toMatch(/bg-danger text-primary-fg/);
});
