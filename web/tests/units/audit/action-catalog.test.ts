import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import en from "@/lib/i18n/locales/en.json";
import vi from "@/lib/i18n/locales/vi.json";
import { sdkFile } from "@tests/support/sdk";

/**
 * The audit log's search matches the catalogue's sentences, so the labels the
 * page shows must be those sentences word for word. The catalogue is the
 * server's list of actions, published in the pinned SDK (D-082 (ii)); a new
 * action reaches this file through a Quizzivy/sdk PR and a pin bump.
 */
const CATALOG = JSON.parse(
  readFileSync(sdkFile("catalogs/audit-actions.json"), "utf8"),
) as {
  actions: { key: string; vi: string; en: string }[];
};

describe.each([
  ["vi", vi.audit.action as Record<string, string>],
  ["en", en.audit.action as Record<string, string>],
] as const)("%s.json audit.action", (lang, labels) => {
  it("words every catalogued action as the catalogue does", () => {
    const want = Object.fromEntries(CATALOG.actions.map((a) => [a.key, a[lang]]));
    expect(labels).toEqual(want);
  });
});

it("the catalogue is not empty", () => {
  expect(CATALOG.actions.length).toBeGreaterThan(0);
});
