import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { Toaster, toast } from "@/components/ui/sonner";
import type { ContentDocument } from "@/components/shared/content/model";
import { contentPlainText } from "@/components/shared/content/plainText";
import type {
  ImportDraftQuestion,
  ImportDraftSection,
  ImportReview,
} from "@/features/imports/api";
import { questionPlaces } from "@/features/imports/draft";
import { http } from "msw";
import { contractJson } from "@tests/support/contractResponse";
import { server } from "@tests/support/server";
import { BASE, question, review, section, text, wordImport } from "./fixtures";
import { card, renderReview, serveReview, type ReviewServer } from "./reviewHarness";
import "@/lib/i18n";

/** Each test mounts the whole review page: CI's five seconds is tight on a busy runner. */
vi.setConfig({ testTimeout: 15_000 });

/** jsdom does no layout; ProseMirror measures a range when it scrolls the selection into view. */
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

let state: ReviewServer;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  state = { puts: [], commits: [] };
});

afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
});

function gapped(id: string, before: string, after = ""): ContentDocument {
  return {
    format: "semantic_v1",
    blocks: [
      {
        type: "paragraph",
        content: [
          ...(before === ""
            ? []
            : [{ type: "text" as const, text: before, marks: [] }]),
          { type: "gap", id, label: "1" },
          ...(after === "" ? [] : [{ type: "text" as const, text: after, marks: [] }]),
        ],
      },
    ],
  };
}

function blank(
  id: string,
  label: string,
  prompt: ContentDocument,
  accepted: string[] = [],
): ImportDraftQuestion {
  return question({
    id,
    label,
    type: "fill_blank",
    prompt,
    options: [],
    blanks: [{ gapId: `g-${id}`, label: "1", accepted, caseSensitive: false }],
    answer: {
      state: accepted.length > 0 ? "known" : "unknown",
      optionIds: [],
      evidence: [],
    },
  });
}

/** A paper as the teachers describe it: part two is five open questions read as fill in the blank. */
function paper(): ImportDraftSection[] {
  return [
    section([question({ id: "q1", label: "1" }), question({ id: "q2", label: "2" })], {
      id: "s1",
      title: "Part 1",
    }),
    section(
      [
        blank("q3", "3", gapped("g-q3", "Where do you live? ")),
        blank("q4", "4", gapped("g-q4", "She ", " to school."), ["goes"]),
        blank("q5", "5", gapped("g-q5", "What is your name? ")),
        question({
          id: "q6",
          label: "6",
          type: "short_answer",
          options: [],
          prompt: text("How old are you?"),
          answer: { state: "unknown", optionIds: [], evidence: [] },
        }),
        question({ id: "q7", label: "7", excluded: { reason: "Trùng câu 1" } }),
      ],
      { id: "s2", title: "Part 2" },
    ),
  ];
}

function serve(
  sections: ImportDraftSection[] = paper(),
  over: Partial<ImportReview> = {},
) {
  serveReview(review(sections, [], over), state);
}

async function open() {
  render(<Toaster />);
  const rendered = await renderReview();
  await screen.findByRole("checkbox", { name: "Chọn câu 1" });
  return rendered;
}

function saved(): Map<string, ImportDraftQuestion> {
  return new Map(
    questionPlaces(state.puts.at(-1)!.sections).map((place) => [
      place.question.id,
      place.question,
    ]),
  );
}

async function settle() {
  const before = state.puts.length;
  await vi.advanceTimersByTimeAsync(1500);
  await waitFor(() => expect(state.puts).toHaveLength(before + 1));
}

const box = (name: string | RegExp) => screen.getByRole("checkbox", { name });

/** undo presses Undo on the toast that says `message`; the open card's editor has an Undo of its own. */
async function undo(user: UserEvent, message: string) {
  const said = await screen.findByText(message);
  const shown = said.closest<HTMLElement>("[data-sonner-toast]")!;
  await user.click(within(shown).getByRole("button", { name: "Hoàn tác" }));
}
const bar = () => screen.getByText(/^Đã chọn \d+ câu$/).parentElement!;

async function chooseType(user: UserEvent, name: string) {
  await user.click(within(bar()).getByRole("button", { name: "Đổi dạng câu" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("combobox", { name: "Dạng câu mới" }));
  await user.click(
    within(await screen.findByRole("listbox")).getByRole("option", { name }),
  );
  return dialog;
}

describe("selecting questions in the review", () => {
  it("offers every question still in the test and a section's worth at once", async () => {
    serve();
    const { user } = await open();
    expect(screen.queryByRole("checkbox", { name: "Chọn câu 7" })).toBeNull();
    expect(screen.queryByText(/^Đã chọn/)).toBeNull();

    await user.click(box("Chọn câu 3"));
    expect(bar()).toHaveTextContent("Đã chọn 1 câu");
    const whole = box("Chọn mọi câu của Part 2") as HTMLInputElement;
    expect(whole.checked).toBe(false);
    expect(whole.indeterminate).toBe(true);

    await user.click(whole);
    expect(bar()).toHaveTextContent("Đã chọn 4 câu");
    expect(whole.checked).toBe(true);
    expect(whole.indeterminate).toBe(false);
    for (const label of ["3", "4", "5", "6"])
      expect(box(`Chọn câu ${label}`)).toBeChecked();
    expect(box("Chọn câu 1")).not.toBeChecked();

    await user.click(whole);
    expect(screen.queryByText(/^Đã chọn/)).toBeNull();
  });

  it("does not open a card, and clears with the bar's button", async () => {
    serve();
    const { user } = await open();
    const before = document.querySelectorAll('button[aria-expanded="true"]').length;
    await user.click(box("Chọn câu 4"));
    await user.click(box("Chọn câu 5"));
    expect(document.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(
      before,
    );
    await user.click(within(bar()).getByRole("button", { name: "Bỏ chọn" }));
    expect(screen.queryByText(/^Đã chọn/)).toBeNull();
    expect(box("Chọn câu 4")).not.toBeChecked();
  });

  it("is not offered once the import is a draft test", async () => {
    serve();
    server.use(
      http.get(`${BASE}/teacher/imports/:id`, () =>
        contractJson(
          "/teacher/imports/{id}",
          "get",
          200,
          wordImport({ status: "committed" }),
        ),
      ),
    );
    await renderReview();
    await screen.findByRole("region", { name: "Part 2" });
    expect(card("q3")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /^Chọn/ })).toBeNull();
  });
});

describe("changing the type of the selected questions", () => {
  it("says what the change does before it is made, then makes it as one save", async () => {
    serve();
    const { user } = await open();
    await user.click(box("Chọn mọi câu của Part 2"));
    await user.click(within(bar()).getByRole("button", { name: "Đổi dạng câu" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Đổi dạng 4 câu đã chọn");
    expect(within(dialog).getByRole("button", { name: "Đổi dạng câu" })).toBeDisabled();

    await user.click(within(dialog).getByRole("combobox", { name: "Dạng câu mới" }));
    await user.click(
      within(await screen.findByRole("listbox")).getByRole("option", {
        name: "Trả lời ngắn",
      }),
    );
    expect(dialog).toHaveTextContent("3 câu sẽ chuyển sang Trả lời ngắn.");
    expect(dialog).toHaveTextContent("1 câu đã là dạng này và giữ nguyên.");
    expect(dialog).toHaveTextContent(
      "Chỗ trống trong nội dung của 3 câu được viết lại",
    );
    expect(dialog).toHaveTextContent(
      "1 câu sẽ mất một phần lựa chọn, đáp án hoặc thiết lập đáp án hiện có: câu 4.",
    );

    await user.click(within(dialog).getByRole("button", { name: "Đổi 3 câu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Đã đổi 3 câu sang Trả lời ngắn")).toBeVisible();
    await settle();

    const now = saved();
    for (const id of ["q3", "q4", "q5", "q6"])
      expect(now.get(id)!.type).toBe("short_answer");
    expect(contentPlainText(now.get("q3")!.prompt)).toBe("Where do you live?");
    expect(contentPlainText(now.get("q4")!.prompt)).toBe("She ___ to school.");
    expect(contentPlainText(now.get("q5")!.prompt)).toBe("What is your name?");
    expect(now.get("q4")!.blanks).toEqual([]);
    expect(now.get("q1")!.type).toBe("single_choice");
    expect(now.get("q7")!.type).toBe("single_choice");
    expect(now.get("q7")!.excluded).toEqual({ reason: "Trùng câu 1" });
    expect(within(card("q3")).getByText("Trả lời ngắn")).toBeInTheDocument();
    expect(bar()).toHaveTextContent("Đã chọn 4 câu");
  });

  it("takes the change back with Undo, gaps and answers included", async () => {
    serve();
    const { user } = await open();
    await user.click(box("Chọn mọi câu của Part 2"));
    const dialog = await chooseType(user, "Trả lời ngắn");
    await user.click(within(dialog).getByRole("button", { name: "Đổi 3 câu" }));
    await undo(user, "Đã đổi 3 câu sang Trả lời ngắn");
    await settle();

    const now = saved();
    const start = new Map(
      questionPlaces(paper()).map((place) => [place.question.id, place.question]),
    );
    for (const id of ["q3", "q4", "q5", "q6"])
      expect(now.get(id)).toEqual(start.get(id));
  });

  it("has nothing to do when every selected question is of the type already", async () => {
    serve();
    const { user } = await open();
    await user.click(box("Chọn câu 1"));
    await user.click(box("Chọn câu 2"));
    const dialog = await chooseType(user, "Một đáp án");
    expect(dialog).toHaveTextContent("Các câu đã chọn đều đang là dạng này");
    expect(within(dialog).getByRole("button", { name: "Đổi dạng câu" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    await vi.advanceTimersByTimeAsync(1500);
    expect(state.puts).toHaveLength(0);
  });

  it("keeps the gap of a question a passage is bound to, and says which", async () => {
    const member = blank("q8", "8", gapped("g-q8", ""));
    serve([
      section([blank("q3", "3", gapped("g-q3", "Where do you live? "))], {
        id: "s1",
        title: "Part 1",
        items: [
          { question: blank("q3", "3", gapped("g-q3", "Where do you live? ")) },
          {
            group: {
              id: "group-1",
              label: "8",
              stimulus: gapped("p1", "I ", " in Hanoi."),
              gaps: [{ gapId: "p1", questionId: "q8", blankGapId: "g-q8" }],
              source: [],
              questions: [member],
            },
          },
        ],
      }),
    ]);
    render(<Toaster />);
    const { user } = await renderReview();
    await user.click(
      await screen.findByRole("checkbox", { name: "Chọn mọi câu của Part 1" }),
    );
    const dialog = await chooseType(user, "Trả lời ngắn");
    expect(dialog).toHaveTextContent(
      "1 câu là chỗ trống của một bài đọc nên giữ chỗ trống của mình, và chưa hợp lệ cho tới khi bạn sửa: câu 8.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Đổi 2 câu" }));
    await settle();
    expect(contentPlainText(saved().get("q3")!.prompt)).toBe("Where do you live?");
    expect(saved().get("q8")!.prompt).toEqual(member.prompt);
    expect(saved().get("q8")!.type).toBe("short_answer");
  });

  it("shows the change in the card that is open", async () => {
    serve();
    const { user } = await open();
    await user.click(card("q3").querySelector<HTMLElement>("button[aria-expanded]")!);
    expect(await screen.findByRole("combobox", { name: "Dạng câu" })).toHaveTextContent(
      "Điền từ",
    );
    await user.click(box("Chọn câu 3"));
    const dialog = await chooseType(user, "Trả lời ngắn");
    await user.click(within(dialog).getByRole("button", { name: "Đổi 1 câu" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Dạng câu" })).toHaveTextContent(
        "Trả lời ngắn",
      ),
    );
    const editor = await screen.findByRole("textbox", { name: "Nội dung câu 3" });
    expect(editor).toHaveTextContent("Where do you live?");
    expect(editor.querySelector("[data-gap-id]")).toBeNull();
    expect(screen.queryByText(/Chỉ câu Điền từ mới có chỗ trống/)).toBeNull();
  });
});

describe("points and exclusion for the selected questions", () => {
  it("sets one value on the selected questions only", async () => {
    serve();
    const { user } = await open();
    await user.click(box("Chọn câu 3"));
    await user.click(box("Chọn câu 6"));
    await user.click(within(bar()).getByRole("button", { name: "Đặt điểm" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Đặt điểm cho câu đã chọn");
    expect(dialog).toHaveTextContent("Part 2");
    expect(dialog).not.toHaveTextContent("Part 1");
    const field = within(dialog).getByLabelText(/Điểm cho mỗi câu/);
    await user.clear(field);
    await user.type(field, "2,5");
    await user.click(
      within(dialog).getByRole("button", { name: "Đặt 2.5 điểm cho 2 câu" }),
    );
    await settle();
    const now = saved();
    expect(now.get("q3")!.points).toBe("2.5");
    expect(now.get("q6")!.points).toBe("2.5");
    expect(now.get("q4")!.points).toBe("1");
    expect(now.get("q3")!.origins.points).toBe("teacher_entered");
  });

  it("leaves the selected questions out with one reason, clears the selection, and can be undone", async () => {
    serve();
    const { user } = await open();
    await user.click(box("Chọn câu 4"));
    await user.click(box("Chọn câu 5"));
    await user.click(within(bar()).getByRole("button", { name: "Loại khỏi đề" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Loại 2 câu đã chọn?");
    await user.type(within(dialog).getByLabelText(/Lý do/), "Không dạy phần này");
    await user.click(within(dialog).getByRole("button", { name: "Loại" }));
    await settle();
    expect(saved().get("q4")!.excluded).toEqual({ reason: "Không dạy phần này" });
    expect(saved().get("q5")!.excluded).toEqual({ reason: "Không dạy phần này" });
    expect(saved().get("q3")!.excluded).toBeUndefined();
    expect(screen.queryByText(/^Đã chọn/)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Chọn câu 4" })).toBeNull();

    await undo(user, "Đã loại 2 câu");
    await settle();
    expect(saved().get("q4")!.excluded).toBeUndefined();
    expect(saved().get("q5")!.excluded).toBeUndefined();
    expect(box("Chọn câu 4")).toBeInTheDocument();
  });
});
