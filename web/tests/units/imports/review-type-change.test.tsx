import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import type { UserEvent } from "@testing-library/user-event";
import type { ContentDocument } from "@/components/shared/content/model";
import { contentPlainText } from "@/components/shared/content/plainText";
import type { ImportDraftQuestion } from "@/features/imports/api";
import { option, question, review, section } from "./fixtures";
import {
  cardHeader,
  renderReview,
  serveReview,
  type ReviewServer,
} from "./reviewHarness";
import "@/lib/i18n";

/** jsdom does no layout; ProseMirror measures a range when it scrolls the selection into view. */
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

let state: ReviewServer;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  state = { puts: [], commits: [] };
});

afterEach(() => {
  vi.useRealTimers();
});

const UNSUPPORTED = /cấu trúc chưa được hỗ trợ/;
const REFUSED = /Không thể áp dụng thay đổi này/;

const TYPE_NAME = {
  single_choice: "Một đáp án",
  multiple_choice: "Nhiều đáp án",
  true_false: "Đúng/Sai",
  tfng: "Đúng / Sai / Không có thông tin",
  fill_blank: "Điền từ",
  short_answer: "Trả lời ngắn",
} as const;

type Type = keyof typeof TYPE_NAME;
const TYPES = Object.keys(TYPE_NAME) as Type[];

function gapPrompt(): ContentDocument {
  return {
    format: "semantic_v1",
    blocks: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Water freezes at ", marks: [] },
          { type: "gap", id: "g1", label: "1" },
          { type: "text", text: " degrees.", marks: [] },
        ],
      },
    ],
  };
}

function blank(over: Partial<ImportDraftQuestion> = {}): ImportDraftQuestion {
  return question({
    id: "q1",
    label: "1",
    type: "fill_blank",
    prompt: gapPrompt(),
    options: [],
    blanks: [{ gapId: "g1", label: "1", accepted: [], caseSensitive: false }],
    answer: { state: "unknown", optionIds: [], evidence: [] },
    ...over,
  });
}

/** of is a question of each type as recognition writes it, its prompt "Question 1". */
function of(type: Type): ImportDraftQuestion {
  if (type === "fill_blank") return blank();
  if (type === "short_answer")
    return question({
      id: "q1",
      label: "1",
      type,
      options: [],
      answer: { state: "unknown", optionIds: [], evidence: [] },
    });
  if (type === "true_false")
    return question({
      id: "q1",
      label: "1",
      type,
      options: [option("q1-t", "A", "True"), option("q1-f", "B", "False")],
      answer: { state: "known", optionIds: ["q1-t"], evidence: [] },
    });
  if (type === "tfng")
    return question({
      id: "q1",
      label: "1",
      type,
      options: [
        option("q1-t", "T", "True"),
        option("q1-f", "F", "False"),
        option("q1-ng", "NG", "Not given"),
      ],
      answer: { state: "known", optionIds: ["q1-t"], evidence: [] },
    });
  return question({ id: "q1", label: "1", type });
}

function serve(...questions: ImportDraftQuestion[]) {
  serveReview(review([section(questions)], []), state);
}

function saved(id = "q1"): ImportDraftQuestion {
  const items = state.puts.at(-1)!.sections[0]!.items;
  return items.find((item) => item.question?.id === id)!.question!;
}

async function settle() {
  const before = state.puts.length;
  await vi.advanceTimersByTimeAsync(1500);
  await waitFor(() => expect(state.puts.length).toBeGreaterThan(before));
}

function promptBox(label = "1"): HTMLElement {
  return screen.getByRole("textbox", { name: `Nội dung câu ${label}` });
}

function editorOf(box: HTMLElement): Editor {
  return (box as unknown as { editor: Editor }).editor;
}

/** choose picks a type in the card's select and answers the dialog that asks before answer data goes. */
async function choose(user: UserEvent, type: Type, confirm = true) {
  await user.click(screen.getByRole("combobox", { name: "Dạng câu" }));
  const list = await screen.findByRole("listbox");
  await user.click(within(list).getByRole("option", { name: TYPE_NAME[type] }));
  const dialog = screen.queryByRole("alertdialog") ?? screen.queryByRole("dialog");
  if (dialog !== null)
    await user.click(
      within(dialog).getByRole("button", { name: confirm ? "Đổi dạng câu" : "Huỷ" }),
    );
  if (confirm)
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Dạng câu" })).toHaveTextContent(
        TYPE_NAME[type],
      ),
    );
  return dialog !== null;
}

/** expectLiveEditor is what a teacher needs after any change: the editor, and neither of its two refusals. */
async function expectLiveEditor(label = "1") {
  const box = await screen.findByRole(
    "textbox",
    { name: `Nội dung câu ${label}` },
    { timeout: 10_000 },
  );
  expect(editorOf(box).isDestroyed).toBe(false);
  expect(screen.queryByText(UNSUPPORTED)).toBeNull();
  expect(screen.queryByText(REFUSED)).toBeNull();
  return box;
}

const STRAY = /Chỉ câu Điền từ mới có chỗ trống/;

function gaps(box: HTMLElement): number {
  return box.querySelectorAll("[data-gap-id]").length;
}

describe("the reported case: a fill-in-the-blank question changed to a short answer", () => {
  it("keeps the editor when the teacher removes the gap and writes the question", async () => {
    serve(blank());
    const { user } = await renderReview();
    await expectLiveEditor();

    await choose(user, "short_answer");
    const box = await expectLiveEditor();
    expect(gaps(box)).toBe(1);
    expect(screen.getByText(STRAY)).toHaveTextContent("câu Trả lời ngắn này");
    expect(screen.queryByRole("button", { name: /Thêm chỗ trống/ })).toBeNull();

    act(() => {
      editorOf(box).chain().selectAll().deleteSelection().run();
    });
    expect(await expectLiveEditor()).toBe(box);
    expect(screen.queryByText(STRAY)).toBeNull();

    act(() => {
      editorOf(box).commands.insertContent("At what temperature does water freeze?");
    });
    expect(await expectLiveEditor()).toBe(box);
    await settle();
    expect(saved().type).toBe("short_answer");
    expect(contentPlainText(saved().prompt)).toBe(
      "At what temperature does water freeze?",
    );
    expect(saved().blanks).toEqual([]);
  });

  it("keeps the editor through undo and redo of the gap's removal", async () => {
    serve(blank());
    const { user } = await renderReview();
    await expectLiveEditor();

    await choose(user, "short_answer");
    const box = await expectLiveEditor();
    act(() => {
      editorOf(box).chain().focus().setNodeSelection(18).deleteSelection().run();
    });
    expect(gaps(await expectLiveEditor())).toBe(0);
    act(() => {
      editorOf(box).commands.undo();
    });
    expect(gaps(await expectLiveEditor())).toBe(1);
    expect(screen.getByText(STRAY)).toBeInTheDocument();
    act(() => {
      editorOf(box).commands.redo();
    });
    expect(await expectLiveEditor()).toBe(box);
    expect(gaps(box)).toBe(0);
    await settle();
    expect(contentPlainText(saved().prompt)).toBe("Water freezes at  degrees.");
  });
});

describe("a short answer changed to fill in the blank", () => {
  it("takes a gap from Insert gap straight away, and the blank's answers field appears", async () => {
    serve(of("short_answer"));
    const { user } = await renderReview();
    await expectLiveEditor();

    await choose(user, "fill_blank");
    await expectLiveEditor();
    await user.click(screen.getByRole("button", { name: /Thêm chỗ trống/ }));
    await expectLiveEditor();
    expect(
      await screen.findByLabelText("Đáp án chấp nhận cho chỗ trống 1"),
    ).toBeInTheDocument();
    await settle();
    expect(saved().type).toBe("fill_blank");
    expect(saved().blanks).toHaveLength(1);
  });
});

const PAIRS = TYPES.flatMap((from) =>
  TYPES.filter((to) => to !== from).map((to) => [from, to] as const),
);

describe("every change of type in the review", () => {
  it.each(PAIRS)(
    "%s to %s keeps the editor, the question's words and an edit made straight after",
    async (from, to) => {
      serve(of(from));
      const { user } = await renderReview();
      await expectLiveEditor();

      await choose(user, to);
      const box = await expectLiveEditor();
      const words =
        from === "fill_blank" ? "Water freezes at 1 degrees." : "Question 1";
      expect(box).toHaveTextContent(words);
      expect(gaps(box)).toBe(from === "fill_blank" ? 1 : 0);
      expect(screen.queryAllByRole("button", { name: /Thêm chỗ trống/ })).toHaveLength(
        to === "fill_blank" ? 1 : 0,
      );
      expect(screen.queryAllByText(STRAY)).toHaveLength(from === "fill_blank" ? 1 : 0);

      act(() => {
        editorOf(promptBox()).chain().focus("end").insertContent(" Why?").run();
      });
      await expectLiveEditor();
      await settle();
      expect(saved().type).toBe(to);
      expect(contentPlainText(saved().prompt)).toBe(
        from === "fill_blank"
          ? "Water freezes at [1] degrees. Why?"
          : "Question 1 Why?",
      );
    },
  );
});

describe("what a fill in the blank leaves behind", () => {
  it("asks before accepted answers go, and Cancel keeps the gap and its answers", async () => {
    serve(
      blank({
        blanks: [{ gapId: "g1", label: "1", accepted: ["zero"], caseSensitive: false }],
        answer: { state: "known", optionIds: [], evidence: [] },
      }),
    );
    const { user } = await renderReview();
    await expectLiveEditor();

    expect(await choose(user, "short_answer", false)).toBe(true);
    expect(screen.getByRole("combobox", { name: "Dạng câu" })).toHaveTextContent(
      "Điền từ",
    );
    expect(gaps(promptBox())).toBe(1);
    expect(screen.getByLabelText("Đáp án chấp nhận cho chỗ trống 1")).toHaveValue(
      "zero",
    );

    expect(await choose(user, "short_answer")).toBe(true);
    expect(gaps(await expectLiveEditor())).toBe(1);
    await settle();
    expect(saved().blanks).toEqual([]);
    expect(contentPlainText(saved().prompt)).toBe("Water freezes at [1] degrees.");
  });

  it("comes back from a short answer with its gap, its blank and Insert gap", async () => {
    serve(blank());
    const { user } = await renderReview();
    await expectLiveEditor();

    await choose(user, "short_answer");
    await choose(user, "fill_blank");
    const box = await expectLiveEditor();
    expect(gaps(box)).toBe(1);
    expect(screen.queryByText(STRAY)).toBeNull();
    expect(
      await screen.findByLabelText("Đáp án chấp nhận cho chỗ trống 1"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Thêm chỗ trống/ }));
    expect(gaps(await expectLiveEditor())).toBe(2);
    expect(
      await screen.findByLabelText("Đáp án chấp nhận cho chỗ trống 2"),
    ).toBeInTheDocument();
    await settle();
    expect(saved().type).toBe("fill_blank");
    expect(saved().blanks.map((item) => item.gapId)).toHaveLength(2);
  });

  it("keeps its gap through two other types, and loses it only to the teacher's own edit", async () => {
    serve(blank());
    const { user } = await renderReview();
    await expectLiveEditor();

    await choose(user, "single_choice");
    await choose(user, "true_false");
    const box = await expectLiveEditor();
    expect(gaps(box)).toBe(1);
    expect(screen.getByText(STRAY)).toHaveTextContent("câu Đúng/Sai này");
    await settle();
    expect(saved().type).toBe("true_false");
    expect(contentPlainText(saved().prompt)).toBe("Water freezes at [1] degrees.");
  });
});

describe("a draft reopened with a gap in a question that is not fill in the blank", () => {
  const stray = () =>
    question({
      id: "q1",
      label: "1",
      type: "short_answer",
      prompt: gapPrompt(),
      options: [],
      answer: { state: "unknown", optionIds: [], evidence: [] },
    });

  it("shows the gap, says why the question is not valid, and keeps the editor when the gap goes", async () => {
    serve(stray());
    await renderReview();
    const box = await expectLiveEditor();
    expect(gaps(box)).toBe(1);
    expect(screen.getByText(STRAY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thêm chỗ trống/ })).toBeNull();

    act(() => {
      editorOf(box).chain().selectAll().deleteSelection().insertContent("Why?").run();
    });
    expect(await expectLiveEditor()).toBe(box);
    expect(screen.queryByText(STRAY)).toBeNull();
    await settle();
    expect(contentPlainText(saved().prompt)).toBe("Why?");
  });
});

describe("leaving a question whose type was just changed", () => {
  it("keeps the change and the words typed after it, and shows them on the way back", async () => {
    serve(blank(), question({ id: "q2", label: "2" }));
    const { user } = await renderReview();
    await expectLiveEditor();

    await choose(user, "short_answer");
    act(() => {
      editorOf(promptBox()).chain().focus("end").insertContent(" Why?").run();
    });
    await user.click(cardHeader("q2"));
    await expectLiveEditor("2");
    await user.click(cardHeader("q1"));

    expect(await expectLiveEditor()).toHaveTextContent(
      "Water freezes at 1 degrees. Why?",
    );
    expect(screen.getByRole("combobox", { name: "Dạng câu" })).toHaveTextContent(
      "Trả lời ngắn",
    );
    await settle();
    expect(saved().type).toBe("short_answer");
    expect(contentPlainText(saved().prompt)).toBe("Water freezes at [1] degrees. Why?");
    expect(contentPlainText(saved("q2").prompt)).toBe("Question 2");
  });
});
