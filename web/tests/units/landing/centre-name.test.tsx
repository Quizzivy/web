import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { LandingApp } from "@/features/landing/LandingApp";
import type { Locale } from "@/features/landing/i18n";
import en from "@/features/landing/locales/en.json";
import viStrings from "@/features/landing/locales/vi.json";
import {
  CENTRE,
  landingBuild,
  openAt,
  readIn,
  renderLanding,
} from "@tests/support/landing";

const STRINGS = { vi: viStrings, en } as const;

/** A centre's name, spelled, once the build's own is taken out of the page. */
const NAMED = /\bCent(?:re|er)\b|Trung tâm (?:Anh|Ngoại) ngữ/;

/** The lines of each page that name the centre, as the strings write them. */
const LINES = {
  "/": (locale: Locale) => {
    const { hero, consult, footer } = STRINGS[locale].landing;
    return [hero.sub, consult.eyebrow, consult.consentA, footer.about];
  },
  "/privacy": (locale: Locale) => [
    STRINGS[locale].privacy.p1a,
    STRINGS[locale].landing.footer.about,
  ],
} as const;

const PAGES = [
  ["/", "vi"],
  ["/", "en"],
  ["/privacy", "vi"],
  ["/privacy", "en"],
] as const;

async function read(address: keyof typeof LINES, locale: Locale): Promise<string> {
  await readIn(locale);
  openAt(address);
  renderLanding(<LandingApp />);
  await screen.findByRole("heading", { level: 1 });
  return document.body.textContent;
}

beforeEach(() => {
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.unstubAllEnvs();
  openAt("/");
});

describe("the centre's name on the landing site", () => {
  // Fails when a line names the centre by anything but the build's VITE_ORG_NAME, or leaves its place unfilled (Quizzivy/web#103).
  it.each(PAGES)(
    "is the build's own wherever %s names the centre, in %s",
    async (address, locale) => {
      landingBuild();
      const page = await read(address, locale);
      for (const text of LINES[address](locale)) {
        expect(page).toContain(text.replace("{{org}}", CENTRE.name));
      }
      expect(page.split(CENTRE.name).join("")).not.toMatch(NAMED);
      expect(page).not.toContain("{{");
    },
  );

  // Fails when a build that names no centre prints anything but the product's name in its place.
  it.each(PAGES)(
    "is Quizzivy on %s where the build sets none, in %s",
    async (address, locale) => {
      landingBuild(["name"]);
      const page = await read(address, locale);
      for (const text of LINES[address](locale)) {
        expect(page).toContain(text.replace("{{org}}", "Quizzivy"));
      }
      expect(page).not.toMatch(NAMED);
      expect(page).not.toContain("{{");
    },
  );
});
