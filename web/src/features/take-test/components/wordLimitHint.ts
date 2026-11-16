import type { TFunction } from "i18next";

/** WORD_HINT is the rule line's style under a prompt: "Write NO MORE THAN THREE WORDS." */
export const WORD_HINT = "text-muted-fg -mt-2 text-sm";

/**
 * wordLimitHint is the deck's rule line under a word-limited prompt, "Write
 * NO MORE THAN THREE WORDS.", or "Write ONE WORD." for a limit of one.
 */
export function wordLimitHint(limit: number, t: TFunction): string {
  if (limit === 1) return t("takeTest.wordLimitHintOne");
  const words = limit <= NUMBER_WORDS ? numberWord(limit, t) : String(limit);
  return t("takeTest.wordLimitHint", { words: words.toLocaleUpperCase() });
}

const NUMBER_WORDS = 11;

/**
 * numberWord writes a "Choose N" count in words, "two" to "eleven", as the
 * deck's hint does ("Choose two answers."); a larger count stays a numeral.
 */
export function numberWord(count: number, t: TFunction): string {
  return count >= 2 && count <= NUMBER_WORDS
    ? t(`takeTest.numberWord.${count}` as "takeTest.numberWord.2")
    : String(count);
}
