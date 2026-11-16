import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { en } from "@tests/support/locales";

type Chunk = {
  type: "chunk";
  name: string;
  fileName: string;
  imports: string[];
  dynamicImports: string[];
  moduleIds: string[];
  code: string;
};
type Output = { output: (Chunk | { type: "asset" })[] };

function closure(
  entry: Chunk,
  chunks: Map<string, Chunk>,
  includeDynamic = true,
  outside: ReadonlySet<string> = new Set(),
): Chunk[] {
  const seen = new Set<string>();
  const pending = [entry];
  const result: Chunk[] = [];
  while (pending.length) {
    const chunk = pending.pop()!;
    if (seen.has(chunk.fileName) || outside.has(chunk.fileName)) continue;
    seen.add(chunk.fileName);
    result.push(chunk);
    for (const name of [
      ...chunk.imports,
      ...(includeDynamic ? chunk.dynamicImports : []),
    ]) {
      const dependency = chunks.get(name);
      if (dependency) pending.push(dependency);
    }
  }
  return result;
}

/**
 * The budgets are what a student downloads. English strings are chunks
 * fetched only on a switch to English (F-20), and the strings of the other
 * surfaces are chunks only their route trees fetch (T-R11.12a): the reader's
 * budget counts the bundled `common` strings and the student's surface, and
 * pins that no other strings are in a chunk it counts. Inside vitest NODE_ENV is "test",
 * so Vite would resolve the `development` export conditions and count builds
 * no student receives (micromark's, with their assertions); the build names
 * the production conditions instead (T-16), and the limits stay as written.
 */
test("keeps editor modules out of the reader and pins prototype transfer budgets", async () => {
  const result = (await build({
    configFile: resolve(
      import.meta.dirname,
      "../../support/content-editor/vite.config.ts",
    ),
    logLevel: "silent",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: { conditions: ["module", "browser", "production"] },
    build: { write: false },
  })) as unknown as Output;
  const chunks = result.output.filter((item): item is Chunk => item.type === "chunk");
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const readerEntry = chunks.find((chunk) => chunk.name === "reader")!;
  // Every string file but the bundled `common` one is a chunk of its own,
  // fetched only by a switch of language or by the route tree that needs it.
  const strings = chunks.filter((chunk) =>
    chunk.moduleIds.some((id) => /\/lib\/i18n\/locales\//.test(id)),
  );
  const file = (chunk: Chunk) =>
    chunk.moduleIds
      .filter((id) => id.includes("/lib/i18n/locales/"))
      .map((id) => id.split("/locales/")[1])
      .join(",");
  const bundled = closure(readerEntry, byName, false).map((chunk) => chunk.fileName);
  expect(strings.filter((chunk) => bundled.includes(chunk.fileName)).map(file)).toEqual(
    ["vi/common.json"],
  );
  const student = strings.find((chunk) => file(chunk) === "vi/student.json")!;
  const others = strings.filter(
    (chunk) => !bundled.includes(chunk.fileName) && chunk !== student,
  );
  expect(others.map(file).sort((a, b) => a.localeCompare(b))).toEqual([
    "en/admin.json",
    "en/auth.json",
    "en/common.json",
    "en/student.json",
    "en/teacher.json",
    "vi/admin.json",
    "vi/auth.json",
    "vi/teacher.json",
  ]);
  const lazy = new Set(others.map((chunk) => chunk.fileName));
  const reader = closure(readerEntry, byName, true, lazy);
  expect(reader).toContain(student);
  expect(reader.filter((chunk) => chunk.code.includes(en.common.actionFailed))).toEqual(
    [],
  );
  const editor = closure(
    chunks.find((chunk) => chunk.name === "editor")!,
    byName,
    false,
  );
  expect(
    reader
      .flatMap((chunk) => chunk.moduleIds)
      .filter((id) => /@tiptap|prosemirror|parse5/.test(id)),
  ).toEqual([]);
  expect(
    editor.flatMap((chunk) => chunk.moduleIds).some((id) => id.includes("@tiptap")),
  ).toBe(true);
  expect(
    editor.flatMap((chunk) => chunk.moduleIds).some((id) => id.includes("parse5")),
  ).toBe(false);
  const clipboard = closure(
    chunks.find((chunk) =>
      chunk.moduleIds.some((id) => id.endsWith("/editor/clipboardHTML.ts")),
    )!,
    byName,
    true,
    lazy,
  );
  expect(
    clipboard.flatMap((chunk) => chunk.moduleIds).some((id) => id.includes("parse5")),
  ).toBe(true);
  const initial = new Set([...reader, ...editor].map((chunk) => chunk.fileName));
  expect(
    clipboard
      .filter((chunk) => !initial.has(chunk.fileName))
      .reduce((total, chunk) => total + gzipSync(chunk.code).byteLength, 0),
  ).toBeLessThan(64 * 1024);
  const shared = new Set(reader.map((chunk) => chunk.fileName));
  expect(
    editor
      .filter((chunk) => !shared.has(chunk.fileName))
      .reduce((total, chunk) => total + gzipSync(chunk.code).byteLength, 0),
  ).toBeLessThan(160 * 1024);
  expect(
    reader.reduce((total, chunk) => total + gzipSync(chunk.code).byteLength, 0),
  ).toBeLessThan(220 * 1024);
}, 60_000);
