import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common from "./locales/vi/common.json";
import type { Strings, Surface } from "./surfaces";

export { SURFACES, type Surface } from "./surfaces";

/**
 * Vietnamese is the product language (§2). `vi` is the default and the
 * fallback, deliberately: if a key is missing, a Vietnamese string is a far
 * better failure than an English one in front of a student.
 */
export const SUPPORTED_LOCALES = ["vi", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";

const STORAGE_KEY = "quizzivy.locale";

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    // Private mode, or storage disabled. Fall through to the default.
  }
  return DEFAULT_LOCALE;
}

/**
 * Only the Vietnamese `common` strings are bundled: what the entry chunk and
 * every screen may show. Each other file is a chunk of its own (T-R11.12a),
 * so a student never downloads the teacher's or the Admin's strings, and a
 * Vietnamese reader never downloads English.
 */
void i18n.use(initReactI18next).init({
  resources: { vi: { translation: structuredClone(common) } },
  partialBundledLanguages: true,
  lng: initialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

let latest = 0;
let chosen = i18n.language as Locale;
const listeners = new Set<() => void>();

function choose(locale: Locale) {
  if (chosen === locale) return;
  chosen = locale;
  for (const listener of listeners) listener();
}

i18n.on("languageChanged", (language: string) => choose(language as Locale));

type Part = "common" | Surface;

const files = import.meta.glob<Strings>(
  ["./locales/*/*.json", "!./locales/vi/common.json"],
  { import: "default" },
);

/** `<language>/<part>` of every file whose strings i18next holds. */
const loaded = new Set<string>(["vi/common"]);
const loading = new Map<string, Promise<void>>();
/** The surfaces a route tree has asked for since the page loaded. */
const surfaces = new Set<Surface>();

/** A bundle removed from i18next takes its files with it. */
function forgetDropped(locale: Locale) {
  if (i18n.hasResourceBundle(locale, "translation")) return;
  for (const part of [...loaded])
    if (part.startsWith(`${locale}/`)) loaded.delete(part);
  for (const part of [...loading.keys()])
    if (part.startsWith(`${locale}/`)) loading.delete(part);
}

function loadPart(locale: Locale, part: Part): Promise<void> {
  forgetDropped(locale);
  const name = `${locale}/${part}`;
  if (loaded.has(name)) return Promise.resolve();
  let load = loading.get(name);
  if (!load) {
    const read =
      name === "vi/common"
        ? () => Promise.resolve(common)
        : files[`./locales/${name}.json`]!;
    // i18next merges later files into the objects it is given: a copy keeps
    // the modules' own objects as the files are.
    load = read().then((strings) => {
      i18n.addResourceBundle(
        locale,
        "translation",
        structuredClone(strings),
        true,
        true,
      );
      loaded.add(name);
    });
    const current = load;
    // A failed fetch is tried again on the next call.
    current.catch(() => {
      if (loading.get(name) === current) loading.delete(name);
    });
    loading.set(name, load);
  }
  return load;
}

function partsNeeded(): Part[] {
  return ["common", ...surfaces];
}

function isLoaded(locale: Locale): boolean {
  forgetDropped(locale);
  return partsNeeded().every((part) => loaded.has(`${locale}/${part}`));
}

/**
 * loadLocale makes `locale`'s strings available: its `common` file and every
 * surface already asked for. It resolves at once when they are loaded and
 * rejects when one of them cannot be fetched.
 */
export async function loadLocale(locale: Locale): Promise<void> {
  await Promise.all(partsNeeded().map((part) => loadPart(locale, part)));
}

/**
 * loadSurface makes one surface's strings available before its route tree
 * renders: in Vietnamese, which is every language's fallback, and in the
 * language on screen or being switched to. It rejects only when the
 * Vietnamese file cannot be fetched; a missing English file leaves the
 * fallback showing, and a later switch to English tries it again.
 */
export async function loadSurface(surface: Surface): Promise<void> {
  surfaces.add(surface);
  const others = new Set<Locale>([i18n.language as Locale, chosen]);
  others.delete(DEFAULT_LOCALE);
  await Promise.all([
    loadPart(DEFAULT_LOCALE, surface),
    ...[...others].map((locale) => loadPart(locale, surface).catch(() => undefined)),
  ]);
}

function apply(locale: Locale): Promise<void> {
  const changed = i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  return changed.then(() => undefined);
}

/**
 * chosenLocale is the language chosen last: the one on screen, or one whose
 * strings are still loading. A language picker shows it, so that picking
 * again while a load is pending is a change and reaches setLocale.
 */
export function chosenLocale(): Locale {
  return chosen;
}

/** subscribeChosenLocale calls listener whenever chosenLocale changes and returns its unsubscribe. */
export function subscribeChosenLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * localeReady is what the first render waits for: null when the starting
 * language's strings are bundled, or the load of the stored language's
 * strings, which settles either way. A failed fetch renders the session in
 * the default language, and keeps the stored choice for the next load.
 */
export const localeReady: Promise<void> | null = isLoaded(i18n.language as Locale)
  ? null
  : loadLocale(i18n.language as Locale).then(
      () => i18n.changeLanguage(i18n.language).then(() => undefined),
      () => apply(DEFAULT_LOCALE),
    );

/**
 * setLocale applies the current explicit language choice and mirrors it when
 * storage permits. With the language's strings loaded it switches at once, as
 * it always has; otherwise it switches once they arrive, unless a later
 * choice came first, and stays on the current language if they cannot be
 * fetched. The promise always resolves.
 */
export function setLocale(locale: Locale): Promise<void> {
  const request = ++latest;
  choose(locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Preference is not persisted; the app still works.
  }
  if (isLoaded(locale)) return apply(locale);
  return loadLocale(locale).then(
    () => (request === latest ? apply(locale) : undefined),
    () => {
      if (request === latest) choose(i18n.language as Locale);
    },
  );
}

export default i18n;
