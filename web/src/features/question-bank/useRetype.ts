import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { notify } from "@/lib/toast";
import type { QuestionType, QuestionValues } from "./questionSchema";
import { dropsAnswers, editorType, recall, retype } from "./questionType";

/**
 * useRetype is a type control's change of type. It changes the type with
 * `retype` and, for as long as the control is mounted (one question's editor),
 * remembers the question as it stood under each type it left, so coming back
 * to a type brings back the answers it held (`recall`). Nothing remembered is
 * stored: a question saved under another type keeps that type's answers only,
 * and the memory goes with the editor.
 *
 * A change that drops answers is taken at once and followed by a notice with
 * Undo, which goes back to the type left, with its answers, and keeps what was
 * typed since (the owner's choice of 2026-11-15, Quizzivy/web#73, as "Remove
 * gap" does). The notice goes when the editor does, so Undo never reaches
 * another question.
 */
export function useRetype(
  value: QuestionValues,
  onChange: (value: QuestionValues) => void,
): (type: QuestionType) => void {
  const { t } = useTranslation();
  const held = useRef(new Map<QuestionType, QuestionValues>());
  const latest = useRef({ value, onChange });
  const notice = useRef<string | number | null>(null);
  useEffect(() => {
    latest.current = { value, onChange };
  });
  useEffect(
    () => () => {
      if (notice.current !== null) notify.dismiss(notice.current);
    },
    [],
  );

  const change = (from: QuestionValues, type: QuestionType): QuestionValues => {
    held.current.set(editorType(from.type), from);
    return recall(retype(from, type), held.current.get(type), from);
  };

  return (type) => {
    if (type === editorType(value.type)) return;
    const left = editorType(value.type);
    const next = change(value, type);
    onChange(next);
    if (notice.current !== null) notify.dismiss(notice.current);
    notice.current = null;
    if (!dropsAnswers(value, next)) return;
    notice.current = notify.success(
      t("questionEditor.typeChangedDrops", {
        type: t(`questionEditor.type.${editorType(type)}`),
      }),
      {
        duration: 6000,
        action: {
          label: t("common.undo"),
          onClick: () => {
            notice.current = null;
            const current = latest.current;
            if (editorType(current.value.type) === left) return;
            current.onChange(change(current.value, left));
          },
        },
      },
    );
  };
}
