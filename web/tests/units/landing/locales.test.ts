import { describe, expect, it } from "vitest";
import en from "@/features/landing/locales/en.json";
import vi from "@/features/landing/locales/vi.json";
import appEn from "@/lib/i18n/locales/en.json";
import appVi from "@/lib/i18n/locales/vi.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("the landing site's strings", () => {
  // Fails when a line exists in one language only.
  it("has the same keys in Vietnamese and English", () => {
    const sorted = (list: string[]) => [...list].sort((a, b) => a.localeCompare(b));
    expect(sorted(keys(vi))).toEqual(sorted(keys(en)));
  });

  // Fails when a line the site copies from the app (the product's name, the theme button, the not-found page) drifts from the app's.
  it.each([
    ["vi", vi, appVi],
    ["en", en, appEn],
  ] as const)(
    "keeps the lines it shares with the app equal to the app's, in %s",
    (_, site, app) => {
      expect(site.app.name).toBe(app.app.name);
      expect(site.notFound).toEqual(app.notFound);
      expect(site.landing.header.toDark).toBe(app.common.darkMode);
      expect(site.landing.header.toLight).toBe(app.common.lightMode);
      expect(site.statusPage.activeT).toBe(app.maintenance.title);
      expect(site.statusPage.activeB).toBe(app.maintenance.body);
      expect(site.statusPage.started).toBe(app.maintenance.started);
      expect(site.statusPage.duration).toBe(app.maintenance.duration);
      expect(site.statusPage.saved).toBe(app.maintenance.saved);
      expect(site.statusPage.activeF).toBe(app.maintenance.footnote);
      expect(site.statusPage.check).toBe(app.maintenance.check);
    },
  );

  // Fails when a line is left empty in either language.
  it("leaves no line empty", () => {
    const empty = (bundle: unknown) =>
      keys(bundle).filter((key) => {
        const value = key
          .split(".")
          .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)[part],
            bundle,
          );
        return typeof value !== "string" || value.trim() === "";
      });
    expect(empty(vi)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });
});
