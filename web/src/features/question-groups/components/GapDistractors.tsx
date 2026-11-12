import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { suggestAiGapDistractors, type AiDistractorsResult } from "@/features/ai/api";
import { AiEntryButton } from "@/features/ai/components/AiEntryButton";
import { credits } from "@/features/ai/credits";
import { AiDistractorsPanel } from "@/features/question-bank/components/AiDistractorsPanel";
import type { QuestionAi } from "@/features/question-bank/questionAi";
import type { QuestionValues } from "@/features/question-bank/questionSchema";
import {
  aiFailureText,
  useAiSuggestion,
} from "@/features/question-bank/useAiSuggestion";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";
import { gapDistractorsRequest, withSuggestion } from "../gapDistractors";
import { GAP_ROWS, type GapRow } from "../gapQuestions";

const SUGGEST =
  "text-muted-fg text-meta hover:bg-muted hover:text-fg dark:hover:bg-muted h-7.5 gap-1.5 rounded-seg px-2.5 font-normal max-[767px]:h-10 [&_svg:not([class*='size-'])]:size-3.5";

const UNSAVED: QuestionAi = { prepare: () => Promise.resolve({ id: "" }) };

/**
 * GapDistractors is "Suggest wrong options" on a gap's card (DG-231): the
 * button, drawn after `children` on their line, and under it the panel of
 * what the assistant suggested. The assistant is sent the gap as the card
 * holds it, saved or not: its sentence, the answers it accepts and the wrong
 * options it has. "Add" writes a suggestion on the first row not filled in,
 * through `onRows`, which is what makes a typed gap a choice. Nothing is
 * drawn of the assistant where it is not offered.
 */
export function GapDistractors({
  values,
  sentence,
  rows,
  also,
  onRows,
  children,
}: Readonly<{
  values: QuestionValues;
  sentence: { before: string; after: string } | null;
  rows: readonly GapRow[];
  also: readonly string[];
  onRows: (rows: readonly GapRow[]) => void;
  children: ReactNode;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const suggestion = useAiSuggestion<AiDistractorsResult>(UNSAVED, values);
  const [added, setAdded] = useState<ReadonlySet<number>>(() => new Set());
  const trigger = useRef<HTMLButtonElement>(null);
  const { stage } = suggestion;
  const result = stage.name === "done" ? stage.result : null;
  const open = result !== null || stage.name === "failed";

  function suggestNow() {
    const request = gapDistractorsRequest(sentence, rows, also);
    if (request === null) {
      notify.info(t("ai.guard.key"));
      return;
    }
    setAdded(new Set());
    void suggestion.ask((_, signal) => suggestAiGapDistractors(request, signal));
  }

  function addSuggestion(index: number) {
    const item = result?.items[index];
    if (item === undefined) return;
    const next = withSuggestion(rows, item.text);
    if (next === null) {
      notify.error(t("questionEditor.maxOptionsToast", { count: GAP_ROWS }));
      return;
    }
    onRows(next);
    setAdded((current) => new Set(current).add(index));
  }

  function error(): string | null {
    if (stage.name === "failed") return aiFailureText(stage.failure, t);
    return result !== null && result.items.length === 0 ? t("ai.unavailable") : null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 empty:hidden">
        {children}
        {suggestion.offered ? (
          <AiEntryButton
            ref={trigger}
            variant="ghost"
            icon={Sparkles}
            label={t(
              stage.name === "running" ? "ai.distract.thinking" : "ai.distract.suggest",
            )}
            blocked={suggestion.block}
            busy={stage.name === "running"}
            size="md"
            className={SUGGEST}
            onClick={suggestNow}
          />
        ) : null}
      </div>
      <div aria-live="polite" className="empty:hidden">
        {suggestion.offered && open ? (
          <AiDistractorsPanel
            items={result?.items ?? []}
            error={error()}
            note={
              result === null
                ? null
                : t("ai.credits.used", {
                    credits: credits(result.usage.credits, locale),
                    left: credits(result.usage.left, locale),
                  })
            }
            added={added}
            onAdd={addSuggestion}
            onClose={() => {
              trigger.current?.focus();
              suggestion.dismiss();
            }}
          />
        ) : null}
      </div>
    </>
  );
}
