import { describe, expect, it } from "vitest";
import { en, vi as vi_ } from "@tests/support/locales";
import { loadSpec } from "@tests/support/openapi";

const fields: string[] = loadSpec().components.schemas.DiffField.enum;
const labels = (locale: typeof vi_) =>
  locale.tests.detail.compare.field as Record<string, string>;

describe("version comparison field labels", () => {
  it("reads the contract's fields", () => {
    expect(fields).toContain("items");
  });

  it.each([
    ["vi", vi_],
    ["en", en],
  ])("names every DiffField in %s", (_, locale) => {
    const missing = fields.filter((field) => !labels(locale)[field]?.trim());
    expect(missing).toEqual([]);
  });
});
