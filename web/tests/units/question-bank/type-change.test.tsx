import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { t } from "i18next";
import { QuestionTypeControl } from "@/features/question-bank/components/QuestionTypeControl";
import {
  emptyQuestion,
  type QuestionType,
  type QuestionValues,
} from "@/features/question-bank/questionSchema";
import { QUESTION_TYPES, retype } from "@/features/question-bank/questionType";
import { useRetype } from "@/features/question-bank/useRetype";
import { BuilderQuestionEditor } from "@/features/tests/components/BuilderQuestionEditor";
import "@/lib/i18n";

/** jsdom does no layout; ProseMirror measures a range when it scrolls the selection into view. */
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const WORDS = "They ___ to the museum.";
const UNSUPPORTED = /cấu trúc chưa được hỗ trợ/;
const REFUSED = /Không thể áp dụng thay đổi này/;

function rich(text: string): NonNullable<QuestionValues["promptContent"]> {
  return {
    format: "semantic_v1",
    blocks: [{ type: "paragraph", content: [{ type: "text", text, marks: [] }] }],
  };
}

const option = (text: string, isCorrect = false) => ({ id: null, text, isCorrect });

/** of is a question of each type the editor offers, with answers a teacher typed. */
function of(type: QuestionType): QuestionValues {
  const base: QuestionValues = {
    ...emptyQuestion(),
    prompt: WORDS,
    promptContent: rich(WORDS),
    options: [],
  };
  switch (type) {
    case "single_choice":
      return { ...base, type, options: [option("went"), option("have gone", true)] };
    case "multiple_choice":
      return {
        ...base,
        type,
        selectCount: 2,
        options: [option("went", true), option("gone"), option("walked", true)],
      };
    case "true_false":
      return { ...base, type, options: [option("True"), option("False", true)] };
    case "tfng":
      return {
        ...base,
        type,
        options: [option("True"), option("False"), option("Not given", true)],
      };
    case "fill_blank":
      return { ...base, type };
    case "short_answer":
      return { ...base, type, sampleAnswer: "They went.", maxWords: 12 };
    case "essay":
      return {
        ...base,
        type,
        points: 9,
        sampleAnswer: "A model essay.",
        rubric: [
          { id: null, label: "Task response" },
          { id: null, label: "Grammar" },
        ],
      };
    case "matching":
      return {
        ...base,
        type,
        matchAllowReuse: true,
        options: [option("a city"), option("a river")],
        matchItems: [
          { id: null, text: "Hanoi", correctOption: 0 },
          { id: null, text: "Mekong", correctOption: 1 },
        ],
      };
  }
}

function mount(start: QuestionValues, clearPromptOnFocus = false) {
  const latest = { current: start };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [value, setValue] = useState(start);
    latest.current = value;
    return (
      <BuilderQuestionEditor
        value={value}
        asset={null}
        number={1}
        clearPromptOnFocus={clearPromptOnFocus}
        onChange={setValue}
        onAssetChange={() => undefined}
      />
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { latest, user: userEvent.setup() };
}

async function choose(user: UserEvent, type: QuestionType) {
  const name = t(`questionEditor.type.${type}`);
  await user.click(screen.getByRole("button", { name: /^Loại câu hỏi:/ }));
  await user.click(
    await screen.findByRole("menuitem", { name: new RegExp(`^${name}`) }),
  );
}

function editorOf(box: HTMLElement): Editor {
  return (box as unknown as { editor: Editor }).editor;
}

async function liveEditor() {
  const box = await screen.findByRole(
    "textbox",
    { name: "Nội dung câu hỏi" },
    { timeout: 10_000 },
  );
  expect(editorOf(box).isDestroyed).toBe(false);
  expect(screen.queryByText(UNSUPPORTED)).toBeNull();
  expect(screen.queryByText(REFUSED)).toBeNull();
  return box;
}

const PAIRS = QUESTION_TYPES.flatMap((from) =>
  QUESTION_TYPES.filter((to) => to !== from).map((to) => [from, to] as const),
);

describe("every change of type in the builder's question editor", () => {
  it.each(PAIRS)(
    "%s to %s keeps the editor, the question's words and an edit made straight after",
    async (from, to) => {
      const { latest, user } = mount(of(from));
      await liveEditor();

      await choose(user, to);
      expect(await liveEditor()).toHaveTextContent(WORDS);
      expect(latest.current.type).toBe(to);

      act(() => {
        editorOf(screen.getByRole("textbox", { name: "Nội dung câu hỏi" }))
          .chain()
          .focus("end")
          .insertContent(" Why?")
          .run();
      });
      expect(await liveEditor()).toHaveTextContent(`${WORDS} Why?`);
      expect(latest.current.prompt).toBe(`${WORDS} Why?`);
      expect(latest.current.type).toBe(to);
    },
  );

  it("keeps a Markdown prompt as it is typed through every type", async () => {
    const { latest, user } = mount({ ...of("single_choice"), promptContent: null });
    for (const to of QUESTION_TYPES.filter((type) => type !== "single_choice")) {
      await choose(user, to);
      expect(screen.getByLabelText("Nội dung câu hỏi")).toHaveValue(WORDS);
      expect(latest.current.type).toBe(to);
      expect(screen.queryByText(UNSUPPORTED)).toBeNull();
    }
  });

  it("gives a fill in the blank made from another type a gap from Insert gap", async () => {
    const { latest, user } = mount(of("short_answer"));
    await choose(user, "fill_blank");
    await liveEditor();
    await user.click(screen.getAllByRole("button", { name: "Thêm chỗ trống" }).at(-1)!);
    await liveEditor();
    expect(latest.current.blanks).toHaveLength(1);
  });

  it("opens a question that still holds the starter prompt empty as a fill in the blank too", async () => {
    const starter = t("builder.starterPrompt");
    const { latest, user } = mount(
      { ...emptyQuestion(), prompt: starter, promptContent: rich(starter) },
      true,
    );
    expect(await liveEditor()).toHaveTextContent("");

    await choose(user, "fill_blank");
    const box = await liveEditor();
    expect(box).toHaveTextContent("");
    expect(latest.current.prompt).toBe(starter);

    act(() => {
      editorOf(box).chain().focus().insertContent("She").run();
    });
    expect(latest.current.prompt).toBe("She");
  });
});

/** trip changes a question's type as one mounted type control does, with edits between the changes. */
function trip(
  start: QuestionValues,
  ...steps: (QuestionType | ((value: QuestionValues) => QuestionValues))[]
): QuestionValues {
  const { result } = renderHook(() => {
    const [value, setValue] = useState(start);
    return { value, setValue, change: useRetype(value, setValue) };
  });
  for (const step of steps)
    act(() => {
      if (typeof step === "string") result.current.change(step);
      else result.current.setValue(step(result.current.value));
    });
  return result.current.value;
}

describe("the answers a type held, when the teacher comes back to it", () => {
  const others = (type: QuestionType) =>
    QUESTION_TYPES.filter((other) => other !== type);

  it.each(QUESTION_TYPES)(
    "%s has them again after a trip through any other type",
    (type) => {
      const start = of(type);
      for (const through of others(type))
        expect(trip(start, through, type), `through ${through}`).toEqual(start);
    },
  );

  it("keeps Not given on a true / false that had it", () => {
    const start = of("tfng");
    expect(trip(start, "short_answer", "true_false")).toEqual(start);
  });

  it("has them again after two types in between", () => {
    const start = of("single_choice");
    expect(trip(start, "true_false", "essay", "single_choice")).toEqual(start);
    expect(trip(of("matching"), "fill_blank", "short_answer", "matching")).toEqual(
      of("matching"),
    );
  });

  it("without the trip, loses them: retype alone hands back empty options", () => {
    const start = of("single_choice");
    const back = retype(retype(start, "short_answer"), "single_choice");
    expect(back.options.map((item) => item.text)).toEqual(["", ""]);
  });

  it("keeps options rewritten in another type that lists options, which are newer", () => {
    const rewritten = trip(
      of("single_choice"),
      "multiple_choice",
      (value) => ({
        ...value,
        options: [option("left", true), option("have gone", true)],
      }),
      "single_choice",
    );
    expect(rewritten.options).toEqual([option("left", true), option("have gone")]);
  });

  it("brings matching items back unanswered beside rewritten options", () => {
    const back = trip(
      of("matching"),
      "single_choice",
      (value) => ({ ...value, options: [option("a town", true), option("a river")] }),
      "matching",
    );
    expect(back.options.map((item) => item.text)).toEqual(["a town", "a river"]);
    expect(back.matchItems).toEqual([
      { id: null, text: "Hanoi", correctOption: -1 },
      { id: null, text: "Mekong", correctOption: -1 },
    ]);
    expect(back.matchAllowReuse).toBe(true);
  });

  it("drops a Choose N count the rewritten options can no longer hold", () => {
    const back = trip(
      of("multiple_choice"),
      "single_choice",
      (value) => ({ ...value, options: value.options.slice(0, 2) }),
      "multiple_choice",
    );
    expect(back.options).toHaveLength(2);
    expect(back).not.toHaveProperty("selectCount");
  });

  it("keeps a sample answer rewritten as an essay, with the short answer's word limit", () => {
    const back = trip(
      of("short_answer"),
      "essay",
      (value) => ({ ...value, sampleAnswer: "A longer answer." }),
      "short_answer",
    );
    expect(back.sampleAnswer).toBe("A longer answer.");
    expect(back.maxWords).toBe(12);
  });

  it("brings Markdown blanks back only to the prompt they were numbered in", () => {
    const blanks = [
      { id: null, ordinal: 1, acceptedAnswers: ["went"], caseSensitive: false },
    ];
    const start: QuestionValues = {
      ...of("fill_blank"),
      prompt: "They {{1}} home.",
      promptContent: null,
      blanks,
    };
    expect(trip(start, "short_answer", "fill_blank").blanks).toEqual(blanks);
    expect(
      trip(
        start,
        "short_answer",
        (value) => ({ ...value, prompt: "They went home." }),
        "fill_blank",
      ).blanks,
    ).toEqual([]);
  });
});

describe("the type controls", () => {
  it("the builder's menu brings back the options and the tick a teacher typed", async () => {
    const { user } = mount(of("single_choice"));
    await choose(user, "short_answer");
    expect(screen.queryByRole("radio")).toBeNull();

    await choose(user, "single_choice");
    expect(screen.getByDisplayValue("went")).toBeInTheDocument();
    expect(screen.getByDisplayValue("have gone")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).not.toBeChecked();
    expect(radios[1]).toBeChecked();
  });

  it("the bank's control does the same", async () => {
    const latest = { current: of("single_choice") };
    function Harness() {
      const [value, setValue] = useState(latest.current);
      latest.current = value;
      return <QuestionTypeControl value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const user = userEvent.setup();
    const control = screen.getByRole("group", { name: "Loại câu hỏi" });

    await user.click(within(control).getByRole("button", { name: "Trả lời ngắn" }));
    expect(latest.current.type).toBe("short_answer");
    expect(latest.current.options).toEqual([]);

    await user.click(within(control).getByRole("button", { name: "Một đáp án" }));
    expect(latest.current).toEqual(of("single_choice"));
  });
});
