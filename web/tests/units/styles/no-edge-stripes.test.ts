import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../../../src");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(?:tsx?|css)$/.test(name) ? [path] : [];
  });
}

// DG-230: no block carries a thick or coloured line on one side. These find a
// line wider than a hairline on the top, left or right edge: a one-sided
// border width, or an inset shadow with no blur. A line under a block (a key
// cap's bottom edge, a blank's underline, the line under the selected tab) is
// a different thing and is not looked for.
const BORDER = /\bborder-[lrtse]-(?:[2-9]|\[\d+(?:\.\d+)?px\])/;
const SHADOW =
  /shadow-\[inset_-?\d+(?:\.\d+)?px_0_0|shadow-\[inset_0_\d+(?:\.\d+)?px_0/;
const DECLARATION =
  /border-(?:left|right|top|inline-start|inline-end|block-start)(?:-width)?\s*:\s*(?:[2-9]|\d{2,})(?:\.\d+)?px/;

describe("no block has a line on one edge (DG-230)", () => {
  it("has no thick line on the top, left or right of a block", () => {
    const offenders = sources(SRC).flatMap((path) => {
      const file = relative(SRC, path).replaceAll("\\", "/");
      return readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          BORDER.test(line) || SHADOW.test(line) || DECLARATION.test(line)
            ? [`${file}:${index + 1}: ${line.trim()}`]
            : [],
        );
    });
    expect(offenders).toEqual([]);
  });
});
