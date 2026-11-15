import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import "@/lib/i18n";
import { draftQuestion } from "@/features/question-bank/aiDrafts";
import { WordLimitField } from "@/features/question-bank/components/WordLimitField";
import {
  emptyQuestion,
  issueKey,
  questionSchema,
  type QuestionValues,
} from "@/features/question-bank/questionSchema";
import { retype } from "@/features/question-bank/questionType";
import { EssayBody } from "@/features/take-test/components/EssayBody";
import type { StudentQuestion } from "@/features/take-test/api";

/**
 * An essay's own word limit, `essayMaxWords`, 1 to 1000 (the owner's call of
 * 2026-11-15, Quizzivy/docs#5): set in the editor, kept by its type only,
 * carried by a generated draft, and counted for the student, as advice.
 */
function essay(over: Partial<QuestionValues> = {}): QuestionValues {
  return {
    ...emptyQuestion(),
    type: "essay",
    prompt: "Describe your town.",
    options: [],
    points: 9,
    rubric: [],
    ...over,
  };
}

describe("an essay's word limit", () => {
  it("is held to an essay and to 1 to 1000", () => {
    expect(questionSchema.safeParse(essay({ essayMaxWords: 250 })).success).toBe(true);
    const over = questionSchema.safeParse(essay({ essayMaxWords: 1001 }));
    expect(over.success).toBe(false);
    if (!over.success)
      expect(issueKey(over.error, "")).toBe("questionEditor.errors.essayMaxWordsRange");
    const misplaced = questionSchema.safeParse({
      ...essay({ essayMaxWords: 250 }),
      type: "short_answer",
      rubric: undefined,
    });
    expect(misplaced.success).toBe(false);
  });

  it("stays with the essay and goes with a change of type", () => {
    const limited = essay({ essayMaxWords: 250 });
    expect(retype(limited, "short_answer").essayMaxWords).toBeUndefined();
    expect(retype(limited, "short_answer").maxWords).toBeUndefined();
  });

  it("comes with an essay draft that asked for one, as a short answer's and a Choose N do", () => {
    const base = { prompt: "Write.", answerKey: [], explanation: "" };
    expect(
      draftQuestion(
        { level: "b2", question: { ...base, type: "essay", essayMaxWords: 250 } },
        null,
      ).essayMaxWords,
    ).toBe(250);
    expect(
      draftQuestion(
        { level: "b2", question: { ...base, type: "short_answer", maxWords: 3 } },
        null,
      ).maxWords,
    ).toBe(3);
    expect(
      draftQuestion(
        {
          level: "b2",
          question: {
            ...base,
            type: "multiple_choice",
            options: ["a", "b", "c"],
            answerKey: ["a", "b"],
            selectCount: 2,
          },
        },
        null,
      ).selectCount,
    ).toBe(2);
  });

  it("is a field of the essay's editor up to 1000, which says when it is out of range", async () => {
    function Host() {
      const [value, setValue] = useState<number | null>(null);
      return <WordLimitField essay value={value} onChange={setValue} />;
    }
    render(<Host />);
    const user = userEvent.setup();
    const field = screen.getByRole("spinbutton", { name: "Giới hạn số từ" });
    expect(field).toHaveAttribute("max", "1000");
    await user.type(field, "1200");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Giới hạn số từ của bài luận phải từ 1 đến 1000.",
    );
    await user.clear(field);
    await user.type(field, "250");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is told to the student and counted as they write, never cut", () => {
    const question = {
      id: "018f0000-0000-7000-8000-0000000000a1",
      type: "essay",
      prompt: "Describe your town.",
      points: 9,
      essayMaxWords: 3,
    } as unknown as StudentQuestion;
    render(
      <EssayBody
        question={question}
        answer={{ type: "text", value: "One two three four" }}
        onAnswer={() => undefined}
        disabled={false}
        larger={false}
      />,
    );
    expect(screen.getByText("Viết KHÔNG QUÁ BA TỪ.")).toBeVisible();
    expect(screen.getByText("4/3 từ · quá số từ")).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveValue("One two three four");
  });
});
