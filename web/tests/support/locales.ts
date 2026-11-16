import { mergeStrings, type Strings } from "@/lib/i18n/surfaces";
import viCommon from "@/lib/i18n/locales/vi/common.json";
import viAuth from "@/lib/i18n/locales/vi/auth.json";
import viStudent from "@/lib/i18n/locales/vi/student.json";
import viTeacher from "@/lib/i18n/locales/vi/teacher.json";
import viAdmin from "@/lib/i18n/locales/vi/admin.json";
import enCommon from "@/lib/i18n/locales/en/common.json";
import enAuth from "@/lib/i18n/locales/en/auth.json";
import enStudent from "@/lib/i18n/locales/en/student.json";
import enTeacher from "@/lib/i18n/locales/en/teacher.json";
import enAdmin from "@/lib/i18n/locales/en/admin.json";

/**
 * One language's strings, every surface merged into one object: the shape the
 * single `locales/{vi,en}.json` had before the split (T-R11.12a). Tests that
 * read the strings themselves, rather than through i18next, read them here.
 * The type is the files' own, intersected, so a test still reads
 * `en.common.cancel` as a string.
 */
function merged<T extends object[]>(...files: T): UnionToIntersection<T[number]> {
  return files.reduce<Strings>(
    (all, file) => mergeStrings(all, file as Strings),
    {},
  ) as UnionToIntersection<T[number]>;
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

export const vi = merged(viCommon, viAuth, viStudent, viTeacher, viAdmin);
export const en = merged(enCommon, enAuth, enStudent, enTeacher, enAdmin);
