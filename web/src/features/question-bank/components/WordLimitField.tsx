import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { ESSAY_MAX_WORDS_LIMIT, MAX_WORDS_LIMIT } from "../questionSchema";

/**
 * WordLimitField is a short answer's optional word limit, 1 to 100 (T-R6.9a;
 * undrawn, listed for sign-off), or with `essay` an essay's, 1 to 1000 (the
 * owner's call of 2026-11-15, `essayMaxWords`). Empty means no limit. The
 * limit is advice: the student sees a live count and a longer answer is
 * flagged, never cut.
 */
export function WordLimitField({
  value,
  essay = false,
  onChange,
}: Readonly<{
  value: number | null;
  essay?: boolean;
  onChange: (value: number | null) => void;
}>) {
  const max = essay ? ESSAY_MAX_WORDS_LIMIT : MAX_WORDS_LIMIT;
  const { t } = useTranslation();
  const id = useId();
  const hint = useId();
  const error = useId();
  const invalid =
    value !== null && (!Number.isInteger(value) || value < 1 || value > max);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-medium">
        {t("questionEditor.wordLimit")}
      </label>
      <p id={hint} className="text-muted-fg -mt-1 text-[12.5px]">
        {t("questionEditor.wordLimitHint")}
      </p>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={value === null || Number.isNaN(value) ? "" : value}
        placeholder={t("questionEditor.wordLimitPlaceholder")}
        aria-describedby={invalid ? `${hint} ${error}` : hint}
        aria-invalid={invalid}
        className="h-8 w-28 rounded-[7px] px-2.5"
        onChange={(event) =>
          onChange(event.target.value.trim() === "" ? null : Number(event.target.value))
        }
      />
      {invalid ? (
        <p id={error} role="alert" className="text-danger-ink text-xs">
          {t(
            essay
              ? "questionEditor.errors.essayMaxWordsRange"
              : "questionEditor.errors.maxWordsRange",
          )}
        </p>
      ) : null}
    </div>
  );
}
