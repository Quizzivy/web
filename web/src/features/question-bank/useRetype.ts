import { useRef } from "react";
import type { QuestionType, QuestionValues } from "./questionSchema";
import { editorType, recall, retype } from "./questionType";

/**
 * useRetype is a type control's change of type. It changes the type with
 * `retype` and, for as long as the control is mounted (one question's editor),
 * remembers the question as it stood under each type it left, so coming back
 * to a type brings back the answers it held (`recall`). Nothing remembered is
 * stored: a question saved under another type keeps that type's answers only,
 * and the memory goes with the editor.
 */
export function useRetype(
  value: QuestionValues,
  onChange: (value: QuestionValues) => void,
): (type: QuestionType) => void {
  const held = useRef(new Map<QuestionType, QuestionValues>());
  return (type) => {
    if (type === editorType(value.type)) return;
    held.current.set(editorType(value.type), value);
    onChange(recall(retype(value, type), held.current.get(type), value));
  };
}
