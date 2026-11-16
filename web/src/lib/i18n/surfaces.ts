/**
 * The app's strings are split by surface (T-R11.12a): `common` is what every
 * screen and the entry chunk may show, and each other file holds what only one
 * route tree renders. `locales/<language>/<surface>.json`, keys unchanged: a
 * key lives in exactly one surface file of a language, and
 * `tests/integration/i18n-surfaces.test.ts` says which.
 */
export const SURFACES = ["auth", "student", "teacher", "admin"] as const;
export type Surface = (typeof SURFACES)[number];

export type Strings = { [key: string]: string | Strings };

/** mergeStrings copies `from` into `into`, tree by tree, and returns `into`. */
export function mergeStrings(into: Strings, from: Strings): Strings {
  for (const [key, value] of Object.entries(from)) {
    const current = into[key];
    if (typeof value === "object" && typeof current === "object")
      mergeStrings(current, value);
    else if (typeof value === "object") into[key] = mergeStrings({}, value);
    else into[key] = value;
  }
  return into;
}
