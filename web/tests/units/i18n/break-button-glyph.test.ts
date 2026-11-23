import { describe, expect, it } from "vitest";
import enCommon from "@/lib/i18n/locales/en/common.json";
import enStudent from "@/lib/i18n/locales/en/student.json";
import viCommon from "@/lib/i18n/locales/vi/common.json";
import viStudent from "@/lib/i18n/locales/vi/student.json";

const BUTTON = /[×✕✖⨯xX](?= (?:button|hay|Tạm nghỉ|Take a break|\{\{breakName\}\}))/u;

function glyph(text: string): string | undefined {
  return BUTTON.exec(text)?.[0];
}

/**
 * The flexible paper's break button is named in two sentences: the intro's
 * leaving rule and the "you left" dialog. Both write it with the one glyph,
 * the multiplication sign, which Be Vietnam Pro draws (spec §12); the copy
 * table's U+2715 is not in the font.
 */
describe("the break button, written the same way everywhere", () => {
  it.each([
    ["vi", viCommon, viStudent],
    ["en", enCommon, enStudent],
  ])("%s", (_, common, student) => {
    const rule = glyph(common.assignments.rules.leaving.flexible);
    const dialog = glyph(student.integrity.left.flexible);
    expect(rule).toBe("×");
    expect(dialog).toBe("×");
  });
});
