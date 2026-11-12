import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { t } from "i18next";
import "@/lib/i18n";
import type { SemanticContent } from "@/components/shared/content/model";
import type { GroupBundle } from "@/features/question-groups/api";
import { GroupWorkspace } from "@/features/question-groups/components/GroupWorkspace";
import {
  gapDistractorsRequest,
  withSuggestion,
} from "@/features/question-groups/gapDistractors";
import {
  withMaterialContent,
  type GapPrompts,
  type GapRow,
} from "@/features/question-groups/gapQuestions";
import { startBundle } from "@/features/question-groups/kinds";
import { groupIssue } from "@/features/question-groups/model";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { server } from "@tests/support/server";
import { aiError, aiOn, BASE, renderWithApp } from "../ai/support";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
          { type: "text", text: "Forests cool the land. Trees ", marks: [] },
          { type: "gap", id: "g1", label: "1" },
          { type: "text", text: " the air cleaner. Rivers feed them.", marks: [] },
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

function mount() {
  const initial = cloze();
  const latest = { current: initial };
  function Host() {
    const [bundle, setBundle] = useState(initial);
    return (
      <GroupWorkspace
        bundle={bundle}
        assets={[]}
        onChange={(next) => {
          latest.current = next;
          setBundle(next);
        }}
        onAsset={() => undefined}
        onRefresh={() => undefined}
      />
    );
  }
  const { user } = renderWithApp(<Host />);
  return { latest, user };
}

function suggestions(bodies: unknown[]) {
  return http.post(`${BASE}/teacher/ai/gaps/distractors`, async ({ request }) => {
    bodies.push(await request.json());
    return contractJson("/teacher/ai/gaps/distractors", "post", 200, {
      items: [
        { text: "do", why: "Goes with other nouns." },
        { text: "take", why: "A common verb." },
      ],
      usage: { credits: 250, left: 18550 },
    });
  });
}

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null });
});

test("“Suggest wrong options” sends the gap as the card holds it, and “Add” makes the typed gap a choice", async () => {
  const bodies: unknown[] = [];
  aiOn();
  server.use(suggestions(bodies));
  const { latest, user } = mount();
  await user.click(screen.getByRole("button", { name: /make/ }));
  expect(latest.current.questions[0]!.input.type).toBe("fill_blank");

  await user.click(
    await screen.findByRole("button", { name: t("ai.distract.suggest") }),
  );
  const panel = await screen.findByRole("region", { name: t("ai.distract.title") });
  expect(bodies).toEqual([
    {
      before: "Trees ",
      after: " the air cleaner.",
      answers: ["make"],
      options: [],
    },
  ]);
  expect(within(panel).getByText("Goes with other nouns.")).toBeInTheDocument();

  await user.click(
    within(panel).getAllByRole("button", { name: t("ai.distract.add") })[0]!,
  );
  await waitFor(() =>
    expect(latest.current.questions[0]!.input.type).toBe("single_choice"),
  );
  const options = latest.current.questions[0]!.input.options ?? [];
  expect(options.map((option) => [option.text, option.isCorrect])).toEqual(
    expect.arrayContaining([
      ["make", true],
      ["do", false],
    ]),
  );
  expect(options).toHaveLength(2);
  expect(latest.current.group.stimuli[0]!.gaps[0]!.kind).toBe("question");
  expect(groupIssue(latest.current)).toBeNull();
  expect(
    within(panel).getByRole("button", { name: t("ai.distract.added") }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: t("ai.distract.suggest") }));
  await waitFor(() => expect(bodies).toHaveLength(2));
  expect(bodies[1]).toMatchObject({ answers: ["make"], options: ["do"] });

  await user.click(
    within(
      await screen.findByRole("region", { name: t("ai.distract.title") }),
    ).getByRole("button", { name: t("ai.distract.close") }),
  );
  expect(screen.queryByRole("region", { name: t("ai.distract.title") })).toBeNull();
});

test("the card says why when the assistant refuses, and adds nothing", async () => {
  aiOn();
  server.use(
    http.post(`${BASE}/teacher/ai/gaps/distractors`, () =>
      aiError(503, "AI_UNAVAILABLE"),
    ),
  );
  const { latest, user } = mount();
  await user.click(screen.getByRole("button", { name: /make/ }));
  await user.click(
    await screen.findByRole("button", { name: t("ai.distract.suggest") }),
  );
  const panel = await screen.findByRole("region", { name: t("ai.distract.title") });
  expect(within(panel).getByText(t("ai.unavailable"))).toBeInTheDocument();
  expect(
    within(panel).queryByRole("button", { name: t("ai.distract.add") }),
  ).toBeNull();
  expect(latest.current.questions[0]!.input.type).toBe("fill_blank");
});

test("a card draws nothing of the assistant where it is not offered", async () => {
  aiOn({ ai: false });
  const { user } = mount();
  await user.click(screen.getByRole("button", { name: /make/ }));
  expect(
    await screen.findByRole("button", { name: t("groups.pane.alsoAccept") }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: t("ai.distract.suggest") })).toBeNull();
});

function rows(...texts: Array<string | [string]>): GapRow[] {
  return texts.map((text) =>
    typeof text === "string"
      ? { text, isCorrect: false }
      : { text: text[0], isCorrect: true },
  );
}

test("the request leaves out the ellipses, empty rows and what is over the contract's limits", () => {
  const long = "x".repeat(1200);
  const request = gapDistractorsRequest(
    { before: `… ${long} to `, after: ` ${long} …` },
    rows("", ["  relax "], "work", " "),
    ["rest", " ", "y".repeat(300)],
  );
  expect(request).toEqual({
    before: `${long} to `.slice(-1000),
    after: ` ${long}`.slice(0, 1000),
    answers: ["relax", "rest", "y".repeat(200)],
    options: ["work"],
  });
  expect(gapDistractorsRequest(null, rows(["relax"], "", "", ""), [])).toEqual({
    before: "",
    after: "",
    answers: ["relax"],
    options: [],
  });
  expect(gapDistractorsRequest(null, rows([" "], "work", "", ""), [])).toBeNull();
});

test("a suggestion lands on the first row not filled in, and nowhere when all are", () => {
  expect(withSuggestion(rows("", ["relax"], "", "work"), "play")).toEqual(
    rows("play", ["relax"], "", "work"),
  );
  expect(withSuggestion(rows("a", ["relax"], "b", "c"), "play")).toBeNull();
});
