import { useState } from "react";
import { expect, test } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { t } from "i18next";
import "@/lib/i18n";
import type { SemanticContent } from "@/components/shared/content/model";
import { contentPlainText } from "@/components/shared/content/plainText";
import type { GroupBundle } from "@/features/question-groups/api";
import { GroupWorkspace } from "@/features/question-groups/components/GroupWorkspace";
import {
  gapQuestions,
  withMaterialContent,
  type GapPrompts,
} from "@/features/question-groups/gapQuestions";
import { startBundle, type GroupStart } from "@/features/question-groups/kinds";
import {
  groupIssue,
  newGroupQuestion,
  withMembers,
} from "@/features/question-groups/model";

const prompts: GapPrompts = {
  typed: t("groups.pane.gapPromptTyped"),
  choice: t("groups.pane.gapPromptChoice"),
  defaults: new Set([
    t("groups.pane.gapPromptTyped"),
    t("groups.pane.gapPromptChoice"),
  ]),
};

function cloze(): GroupBundle {
  const start = startBundle("cloze", t);
  const content: SemanticContent = {
    format: "semantic_v1",
    blocks: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Trees ", marks: [] },
          { type: "gap", id: "g1", label: "1" },
          { type: "text", text: " the air cleaner.", marks: [] },
        ],
      },
    ],
  };
  return withMaterialContent(start, start.group.stimuli[0]!.id, content, {
    words: new Map([["g1", "make"]]),
    restore: new Map(),
    prompts,
  }).bundle;
}

function mount(initial: GroupBundle, start?: GroupStart) {
  const latest = { current: initial };
  function Host() {
    const [bundle, setBundle] = useState(initial);
    return (
      <GroupWorkspace
        bundle={bundle}
        assets={[]}
        start={start}
        firstNumber={9}
        onChange={(next) => {
          latest.current = next;
          setBundle(next);
        }}
        onAsset={() => undefined}
        onRefresh={() => undefined}
      />
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Host />
    </QueryClientProvider>,
  );
  return latest;
}

test("a gap's card lists the word on its row and turns the gap into a choice with the first wrong option", async () => {
  const latest = mount(cloze());
  const user = userEvent.setup();
  expect(
    screen.getByRole("heading", { name: t("groups.pane.gapsHeading") }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /make/ }));
  const card = screen
    .getByRole("heading", { name: t("groups.pane.gapHead", { number: 9 }) })
    .closest("[data-group-card]") as HTMLElement;
  expect(within(card).getByText(t("groups.pane.typedHelp"))).toBeInTheDocument();
  const rows = within(card).getAllByRole("textbox", { name: /^Lựa chọn [A-D]$/ });
  expect(rows).toHaveLength(4);
  expect(rows.filter((row) => (row as HTMLInputElement).value === "make")).toHaveLength(
    1,
  );

  const empty = rows.find((row) => (row as HTMLInputElement).value === "")!;
  await user.type(empty, "do");
  await waitFor(() =>
    expect(latest.current.questions[0]!.input.type).toBe("single_choice"),
  );
  expect(latest.current.group.stimuli[0]!.gaps[0]!.kind).toBe("question");
  expect(groupIssue(latest.current)).toBeNull();
  expect(within(card).queryByText(t("groups.pane.typedHelp"))).toBeNull();
  expect(
    within(card).getByRole("textbox", { name: t("questionEditor.prompt") }),
  ).toHaveValue(t("groups.pane.gapPromptChoice"));

  await user.clear(empty);
  await waitFor(() =>
    expect(latest.current.questions[0]!.input.type).toBe("fill_blank"),
  );
  expect(latest.current.group.stimuli[0]!.gaps[0]!.kind).toBe("blank");
});

test("“Remove gap” puts the word back in the text and takes the question with it", async () => {
  const latest = mount(cloze());
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /make/ }));
  const card = screen
    .getByRole("heading", { name: t("groups.pane.gapHead", { number: 9 }) })
    .closest("[data-group-card]") as HTMLElement;
  await user.click(
    within(card).getByRole("button", { name: t("builder.editor.more") }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: t("groups.pane.removeGap") }),
  );
  await waitFor(() => expect(latest.current.questions).toEqual([]));
  expect(latest.current.group.members).toEqual([]);
  const material = latest.current.group.stimuli[0]!;
  expect(material.gaps).toEqual([]);
  expect(contentPlainText(material.content)).toBe("Trees make the air cleaner.");
  expect(gapQuestions(latest.current).size).toBe(0);
});

test("a question is added by type at the end of the stack and opens in place", async () => {
  const latest = mount(startBundle("reading", t), "reading");
  const user = userEvent.setup();
  expect(
    screen.getByRole("heading", { name: t("groups.kind.reading.questions") }),
  ).toBeInTheDocument();
  expect(screen.getByText(t("groups.pane.questionsEmpty"))).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: t("questionEditor.type.true_false") }),
  );
  await waitFor(() => expect(latest.current.group.members).toHaveLength(1));
  expect(latest.current.questions[0]!.input.type).toBe("true_false");
  expect(
    await screen.findByRole("heading", {
      name: t("builder.editor.questionNumber", { number: 9 }),
    }),
  ).toBeInTheDocument();
});

test("the heading names the question that is not finished and opens it", async () => {
  const base = withMembers(startBundle("reading", t), [
    newGroupQuestion(t),
    newGroupQuestion(t),
  ]);
  const second = base.questions[1]!;
  mount({
    ...base,
    questions: [
      base.questions[0]!,
      {
        ...second,
        input: {
          ...second.input,
          options: [
            { text: "A", isCorrect: true },
            { text: "", isCorrect: false },
          ],
        },
      },
    ],
  });
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: t("groups.pane.unfinished", { number: 10 }) }),
  );
  expect(
    await screen.findByRole("heading", {
      name: t("builder.editor.questionNumber", { number: 10 }),
    }),
  ).toBeInTheDocument();
});

test("one title is written to the group and to its one material", async () => {
  const latest = mount(startBundle("reading", t), "reading");
  const user = userEvent.setup();
  const title = screen.getByRole("textbox", { name: t("groups.titleLabel") });
  await user.clear(title);
  await user.type(title, "Green space");
  await waitFor(() => expect(latest.current.group.title).toBe("Green space"));
  expect(latest.current.group.stimuli[0]!.title).toBe("Green space");
});

test("a pane started from a recording asks for the file and offers a text under it", () => {
  mount(startBundle("listening", t), "listening");
  expect(screen.getByText(t("groups.pane.audioDrop"))).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: new RegExp(t("groups.pane.addText")) }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: t("groups.kind.listening.questions") }),
  ).toBeInTheDocument();
});

test("a text pane offers a recording above the text, and a cloze its three steps", () => {
  mount(startBundle("cloze", t), "cloze");
  expect(
    screen.getByRole("button", { name: new RegExp(t("groups.pane.addAudio")) }),
  ).toBeInTheDocument();
  expect(screen.getByText(t("groups.pane.stepsTitle"))).toBeInTheDocument();
  expect(screen.getByText(t("groups.pane.gapsEmpty"))).toBeInTheDocument();
  expect(screen.getByRole("button", { name: t("groups.pane.makeGap") })).toBeDisabled();
});
