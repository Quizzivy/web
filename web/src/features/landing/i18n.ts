import { createInstance } from "i18next";
import { useSyncExternalStore } from "react";
import { initReactI18next, useTranslation } from "react-i18next";
import vi from "./locales/vi.json";

/**
 * The landing site's own strings and language. The site is a build of its
 * own, so it carries only its pages' strings: Vietnamese with the page, and
 * English as a chunk fetched on the first switch. The choice is kept under
 * the key the app uses, so `boot.js` sets the page's language before paint.
 */
export const LOCALES = ["vi", "en"] as const;

/** Locale is a language the landing site is written in. */
export type Locale = (typeof LOCALES)[number];

const DEFAULT_LOCALE: Locale = "vi";
const STORAGE_KEY = "quizzivy.locale";

function asLocale(language: string | null | undefined): Locale {
  return language === "en" ? "en" : DEFAULT_LOCALE;
}

function stored(): Locale {
  try {
    return asLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** landingI18n is the i18next instance the landing site's pages read. */
export const landingI18n = createInstance();

void landingI18n.use(initReactI18next).init({
  resources: { vi: { translation: vi } },
  partialBundledLanguages: true,
  lng: stored(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

async function load(locale: Locale): Promise<void> {
  if (landingI18n.hasResourceBundle(locale, "translation")) return;
  const strings = await import("./locales/en.json");
  landingI18n.addResourceBundle(locale, "translation", strings.default, true, true);
}

async function apply(locale: Locale): Promise<void> {
  await landingI18n.changeLanguage(locale);
  document.documentElement.lang = locale;
}

/**
 * localeReady is what the first render waits for: null when the starting
 * language's strings are with the page, else the load of the stored
 * language's, which settles either way: a failed fetch renders the page in
 * Vietnamese and keeps the stored choice for the next visit.
 */
export const localeReady: Promise<void> | null = landingI18n.hasResourceBundle(
  landingI18n.language,
  "translation",
)
  ? null
  : load(asLocale(landingI18n.language)).then(
      () => apply(asLocale(landingI18n.language)),
      () => apply(DEFAULT_LOCALE),
    );

let latest = 0;
let chosen: Locale = asLocale(landingI18n.language);
const listeners = new Set<() => void>();

function choose(locale: Locale) {
  if (chosen === locale) return;
  chosen = locale;
  for (const listener of listeners) listener();
}

landingI18n.on("languageChanged", (language: string) => choose(asLocale(language)));

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * setLocale applies a language choice and keeps it where storage permits. It
 * switches once that language's strings are in, unless a later choice came
 * first, and stays on the current language when they cannot be fetched. The
 * promise always resolves.
 */
export function setLocale(locale: Locale): Promise<void> {
  const request = ++latest;
  choose(locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The choice is not kept; the page still switches.
  }
  return load(locale).then(
    () => (request === latest ? apply(locale) : undefined),
    () => {
      if (request === latest) choose(asLocale(landingI18n.language));
    },
  );
}

/** useLocale is the language on screen. */
export function useLocale(): Locale {
  return asLocale(useTranslation().i18n.language);
}

/**
 * useChosenLocale is the language chosen last, which can still be loading
 * while the page shows the previous one. The language switch binds to it.
 */
export function useChosenLocale(): Locale {
  return useSyncExternalStore(subscribe, () => chosen);
}
