import { describe, expect, it } from "vitest";
import { vi, en } from "@tests/support/locales";
import i18n from "@/lib/i18n";
import { formatDateTime, countdown, APP_TIME_ZONE } from "@/lib/i18n/datetime";

/** Flatten to dotted key paths so a nested drift is caught, not just a top-level one. */
function keyPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

/**
 * Vietnamese has one plural category: `Intl.PluralRules("vi")` answers
 * "other" for every count, so i18next reads a `vi` key ending in `_other` and
 * never one ending in `_one`. `vi.json` rides in a student's first download
 * (tests/integration/content/bundle.test.ts), so it holds the form that is
 * read and no other. English keeps both.
 */
describe("locale parity", () => {
  const viKeys = keyPaths(vi).sort((a, b) => a.localeCompare(b));
  const enKeys = keyPaths(en).sort((a, b) => a.localeCompare(b));

  it("has the same keys in vi and en, but for the singular form vi never reads", () => {
    expect(
      enKeys.filter((k) => !k.endsWith("_one") && !viKeys.includes(k)),
      "keys in en but missing from vi",
    ).toEqual([]);
    expect(
      enKeys.filter(
        (k) => k.endsWith("_one") && !viKeys.includes(k.replace(/_one$/, "_other")),
      ),
      "plural keys in en whose _other form is missing from vi",
    ).toEqual([]);
    expect(
      viKeys.filter((k) => !enKeys.includes(k)),
      "keys in vi but missing from en",
    ).toEqual([]);
  });

  it("keeps no _one form in vi, where i18next reads _other for every count", () => {
    for (const count of [0, 1, 2, 5, 21, 100])
      expect(new Intl.PluralRules("vi").select(count)).toBe("other");
    expect(viKeys.filter((k) => k.endsWith("_one"))).toEqual([]);
  });

  it("reads the one Vietnamese form for a count of one, and each English form for its count", () => {
    const key = "imports.review.questionsCount";
    expect(i18n.t(key, { count: 1, lng: "vi" })).toBe("1 câu hỏi");
    expect(i18n.t(key, { count: 3, lng: "vi" })).toBe("3 câu hỏi");
    expect(i18n.t(key, { count: 1, lng: "en" })).toBe("1 question");
    expect(i18n.t(key, { count: 3, lng: "en" })).toBe("3 questions");
  });

  it("gives English both forms of every plural", () => {
    expect(
      enKeys.filter(
        (k) => k.endsWith("_other") && !enKeys.includes(k.replace(/_other$/, "_one")),
      ),
    ).toEqual([]);
  });

  it("has no empty strings", () => {
    const empty = (obj: unknown, prefix = ""): string[] => {
      if (typeof obj === "string") return obj.trim() === "" ? [prefix] : [];
      if (typeof obj !== "object" || obj === null) return [];
      return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
        empty(v, prefix ? `${prefix}.${k}` : k),
      );
    };
    expect(empty(vi)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });
});

describe("datetime", () => {
  it("renders UTC in Asia/Ho_Chi_Minh, not the device timezone", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Ho_Chi_Minh");
    expect(formatDateTime("2026-01-15T03:30:00Z")).toBe("10:30, 15/01/2026");
  });

  it("rolls the date over correctly across the UTC+7 boundary", () => {
    // 17:00Z is midnight the NEXT day in Ho Chi Minh City.
    expect(formatDateTime("2026-01-15T17:00:00Z")).toBe("00:00, 16/01/2026");
  });

  it("formats a countdown", () => {
    expect(countdown(0)).toBe("00:00");
    expect(countdown(59_000)).toBe("00:59");
    expect(countdown(90_000)).toBe("01:30");
    expect(countdown(3_600_000)).toBe("1:00:00");
    expect(countdown(-5_000), "a passed deadline shows zero, never negative").toBe(
      "00:00",
    );
  });
});
