import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http } from "msw";
import TestBuilderPage from "@/features/tests/pages/teacher/TestBuilderPage";
import { OutlineTree } from "@/features/tests/components/OutlineTree";
import type { OutlineSection } from "@/features/tests/outline";
import type { GroupBundle, StoredGroup } from "@/features/question-groups/api";
import type { GroupMaterial } from "@/features/question-groups/model";
import type { components } from "@/lib/api/schema";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { viewport } from "@tests/support/viewport";
import "@/lib/i18n";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const BASE = "http://localhost:8080";
const TEST_ID = "018f0000-0000-7000-8000-0000000002a1";
const SECTION_ID = "018f0000-0000-7000-8000-0000000002c1";
const QUESTION_ID = "018f0000-0000-7000-8000-0000000002b1";
const GROUP_ID = "018f0000-0000-7000-8000-0000000002d1";
const MEMBER_ID = "018f0000-0000-7000-8000-0000000002e1";
const AUDIO_ID = "018f0000-0000-7000-8000-0000000002f1";
const STAMP = "2026-01-01T00:00:00Z";
const TITLE = "Why cities need green space";

function passage(title: string, gaps = 0): GroupMaterial {
  return {
    id: crypto.randomUUID(),
    title,
    content: {
      format: "semantic_v1",
      blocks: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Parks cool the streets.", marks: [] },
            ...Array.from({ length: gaps }, (_, index) => ({
              type: "gap" as const,
              id: `g${index + 1}`,
              label: String(index + 1),
            })),
          ],
        },
      ],
    },
    gaps: [],
  };
}

function recording(assetIds: string[], text = false): GroupMaterial {
  return {
    id: crypto.randomUUID(),
    title: "Listening",
    content: {
      format: "semantic_v1",
      blocks: [
        {
          type: "paragraph",
          content: text ? [{ type: "text", text: "Listen twice.", marks: [] }] : [],
        },
        ...assetIds.map((assetId) => ({
          type: "audio" as const,
          assetId,
          label: "Track",
        })),
      ],
    },
    gaps: [],
  };
}

function bundle(
  stimuli: GroupMaterial[],
  maxPlays: (number | null)[] = [],
  title = "Reading club",
): GroupBundle {
  const assetIds = stimuli.flatMap((material) =>
    material.content.format === "semantic_v1"
      ? material.content.blocks.flatMap((block) =>
          block.type === "audio" ? [block.assetId] : [],
        )
      : [],
  );
  return {
    group: {
      id: GROUP_ID,
      title,
      members: [{ questionId: MEMBER_ID, optionOrder: "shuffle" }],
      stimuli,
      recordings: assetIds.map((assetId, index) => ({
        id: crypto.randomUUID(),
        assetId,
        policy: {
          maxPlays: maxPlays[index] ?? null,
          allowSeek: false,
          showTranscriptAfterSubmit: false,
          allowPause: true,
        },
        transcript: null,
      })),
    },
    questions: [
      {
        id: MEMBER_ID,
        input: {
          type: "single_choice",
          level: null,
          skill: null,
          prompt: "What do parks do?",
          points: 1,
          options: [
            { text: "Cool the streets", isCorrect: true },
            { text: "Heat the streets", isCorrect: false },
          ],
          blanks: [],
          tags: [],
        },
      },
    ],
  };
}

function sections(): OutlineSection[] {
  return [
    {
      id: "s1",
      title: "Đọc hiểu",
      instructions: null,
      questionIds: [],
      units: [{ kind: "group", id: GROUP_ID }],
    },
    { id: "s2", title: "Viết", instructions: null, questionIds: [] },
  ];
}

function renderTree(value: GroupBundle, initial: OutlineSection[] = sections()) {
  const handlers = {
    onChange: vi.fn(),
    onSelectGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onRemoveGroup: vi.fn(),
  };
  function Harness() {
    const [outline, setOutline] = useState(initial);
    return (
      <OutlineTree
        sections={outline}
        questions={new Map()}
        groups={new Map([[GROUP_ID, value]])}
        selectedId={null}
        creating={false}
        onCreateQuestion={vi.fn()}
        onPickFromBank={vi.fn()}
        onAddSection={vi.fn()}
        onSelect={vi.fn()}
        onSelectGroup={handlers.onSelectGroup}
        onRenameGroup={handlers.onRenameGroup}
        onRemoveGroup={handlers.onRemoveGroup}
        onChange={(next) => {
          handlers.onChange(next);
          setOutline(next);
        }}
      />
    );
  }
  render(<Harness />);
  return { user: userEvent.setup(), ...handlers };
}

const groupMenu = () =>
  screen.getByRole("button", { name: "Thao tác với Reading club" });

describe("the group's row in the outline", () => {
  it("names the group for what it holds, with that kind's icon and no line under it", () => {
    renderTree(bundle([passage(TITLE)]));
    expect(screen.getByRole("img", { name: "Bài đọc" })).toHaveClass(
      "lucide-book-open-text",
    );
    expect(screen.queryByRole("button", { name: /^Bài đọc ·|^Bài nghe ·/ })).toBeNull();
  });

  it("names a group with a recording a recording, whatever else it holds", () => {
    renderTree(bundle([recording([AUDIO_ID], true)], [2]));
    expect(screen.getByRole("img", { name: "Bài nghe" })).toHaveClass(
      "lucide-audio-lines",
    );
  });

  it("names a group whose every question answers a gap a cloze, and shows the gap's word", () => {
    const value = bundle([passage(TITLE, 1)]);
    value.group.stimuli[0]!.gaps = [
      { kind: "question", gapId: "g1", questionId: MEMBER_ID },
    ];
    renderTree(value);
    expect(screen.getByRole("img", { name: "Bài điền từ" })).toHaveClass(
      "lucide-text-cursor-input",
    );
    const row = screen
      .getByRole("button", { name: "Kéo câu 1" })
      .closest("[data-outline-row]") as HTMLElement;
    expect(within(row).getByRole("button", { name: /Cool the streets/ })).toBeVisible();
    expect(within(row).queryByText("What do parks do?")).toBeNull();
  });

  it("marks the row while one of its questions is not finished", () => {
    const value = bundle([passage(TITLE)]);
    expect(screen.queryByRole("img", { name: "Có câu chưa xong" })).toBeNull();
    value.questions[0]!.input.options = [{ text: "Cool the streets", isCorrect: true }];
    renderTree(value);
    expect(screen.getByRole("img", { name: "Có câu chưa xong" })).toHaveClass(
      "lucide-circle-alert",
    );
  });

  it("puts the row's actions in a menu, in the export's order, ends disabled", async () => {
    const { user } = renderTree(bundle([passage(TITLE)]));
    const trigger = groupMenu();

    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Đổi tên",
      "Di chuyển lên",
      "Di chuyển xuống",
      "Xoá bài đọc này",
    ]);
    expect(trigger.closest(".overflow-y-auto")?.contains(menu)).toBe(false);
    expect(items[1]).toHaveAttribute("aria-disabled", "true");
    expect(items[2]).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByRole("menuitem", { name: "Nội dung dùng chung" })).toBeNull();
  });

  it("disables Move down on the outline's last unit", async () => {
    const { user } = renderTree(bundle([passage(TITLE)]), [
      { id: "s0", title: "Nghe", instructions: null, questionIds: [] },
      ...sections().slice(0, 1),
    ]);

    await user.click(groupMenu());
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Di chuyển lên" }),
    ).not.toHaveAttribute("aria-disabled");
    expect(
      within(menu).getByRole("menuitem", { name: "Di chuyển xuống" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("moves, removes and renames the group from its items, and opens it from its title", async () => {
    const { user, onChange, onRemoveGroup, onRenameGroup, onSelectGroup } = renderTree(
      bundle([passage(TITLE)]),
    );

    const heading = screen
      .getAllByRole("button", { name: "Reading club" })
      .find((button) => !button.hasAttribute("aria-expanded"));
    await user.click(heading!);
    expect(onSelectGroup).toHaveBeenCalledWith(GROUP_ID, undefined);

    await user.click(groupMenu());
    await user.click(await screen.findByRole("menuitem", { name: "Đổi tên" }));
    expect(onRenameGroup).toHaveBeenCalledWith(GROUP_ID);
    expect(onChange).not.toHaveBeenCalled();

    await user.click(groupMenu());
    await user.click(await screen.findByRole("menuitem", { name: "Di chuyển xuống" }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "s1", units: [] }),
      expect.objectContaining({ id: "s2", units: [{ kind: "group", id: GROUP_ID }] }),
    ]);

    await user.click(groupMenu());
    await user.click(await screen.findByRole("menuitem", { name: "Xoá bài đọc này" }));
    expect(onRemoveGroup).toHaveBeenCalledWith(GROUP_ID, groupMenu());
  });

  it("draws each member as a question row with the deck's grip before its number", () => {
    renderTree(bundle([passage(TITLE)]));

    const grip = screen.getByRole("button", { name: "Kéo câu 1" });
    expect(grip).toHaveAttribute("aria-roledescription", "sortable");
    expect(grip).toHaveClass("h-6", "w-5", "cursor-grab", "touch-none");
    expect(grip.querySelector("svg")).toHaveClass(
      "lucide-grip-vertical",
      "size-3.5",
      "opacity-40",
    );
    const row = grip.closest("[data-outline-row]")!;
    expect(row).toHaveAttribute("data-outline-question", MEMBER_ID);
    expect(row).toHaveClass("min-h-8", "gap-1", "rounded-[7px]", "pr-1", "pl-0.5");
    const select = within(row as HTMLElement).getByRole("button", {
      name: /What do parks do\?/,
    });
    expect(select.textContent).toBe("1What do parks do?1đ");
    expect(row.firstElementChild).toBe(grip);
  });

  it("disables the grip of a member a material gap is bound to, and says why", () => {
    const value = bundle([passage(TITLE, 1)]);
    value.group.stimuli[0]!.gaps = [
      { kind: "question", gapId: "g1", questionId: MEMBER_ID },
    ];
    renderTree(value);

    const grip = screen.getByRole("button", { name: "Kéo câu 1" });
    expect(grip).toHaveAttribute("aria-disabled", "true");
    expect(grip).toHaveAccessibleDescription(
      "Trả lời cho một chỗ trống trong đoạn văn",
    );
    expect(grip).toHaveClass("cursor-not-allowed");
    expect(grip).not.toHaveClass("cursor-grab");
  });

  it("opens and runs the menu from the keyboard, and returns focus to its trigger", async () => {
    const { user, onRemoveGroup } = renderTree(bundle([passage(TITLE)]));

    groupMenu().focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Đổi tên" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await waitFor(() =>
      expect(onRemoveGroup).toHaveBeenCalledWith(GROUP_ID, groupMenu()),
    );
    await waitFor(() => expect(groupMenu()).toHaveFocus());
  });
});

const standalone: components["schemas"]["AdminQuestion"] = {
  level: null,
  skill: null,
  id: QUESTION_ID,
  type: "short_answer",
  prompt: "Viết 2–3 câu về công viên gần nhà.",
  media: null,
  audio: null,
  transcript: null,
  options: [],
  blanks: [],
  points: 5,
  explanation: null,
  sampleAnswer: null,
  tags: [],
  createdAt: STAMP,
  updatedAt: STAMP,
};

let writes: string[];
let patches: { id: string; points: number }[];

beforeEach(() => {
  viewport(1280);
  writes = [];
  patches = [];
  const stored: StoredGroup = {
    bundle: bundle([passage(TITLE)]),
    ownerSectionId: SECTION_ID,
    revision: 1,
    testUpdatedAt: STAMP,
    archivedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    assets: [],
    unavailableAssetIds: [],
  };
  server.events.removeAllListeners();
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "GET") writes.push(`${request.method} ${request.url}`);
  });
  server.use(
    http.get(`${BASE}/teacher/tests/${TEST_ID}`, () =>
      contractJson("/teacher/tests/{id}", "get", 200, {
        skills: [],
        assignments: { live: 0, scheduled: 0, closed: 0 },
        unpublishedChanges: null,
        id: TEST_ID,
        title: "Unit 6",
        description: null,
        status: "draft",
        currentVersion: 0,
        nextVersion: 1,
        totalPoints: 6,
        questionCount: 2,
        audioCount: 0,
        sections: [
          {
            id: SECTION_ID,
            ordinal: 0,
            title: "Đọc hiểu",
            instructions: null,
            questionIds: [QUESTION_ID],
            units: [
              { kind: "question", id: QUESTION_ID },
              { kind: "group", id: GROUP_ID },
            ],
          },
        ],
        createdAt: STAMP,
        updatedAt: STAMP,
      } satisfies components["schemas"]["Test"]),
    ),
    http.get(`${BASE}/teacher/questions/:id`, () =>
      contractJson("/teacher/questions/{id}", "get", 200, standalone),
    ),
    http.get(`${BASE}/teacher/question-groups/:id`, () =>
      contractJson("/teacher/question-groups/{id}", "get", 200, stored),
    ),
    http.patch(`${BASE}/teacher/questions/:id`, async ({ params, request }) => {
      const body = (await request.json()) as { points: number };
      patches.push({ id: String(params.id), points: body.points });
      return contractJson("/teacher/questions/{id}", "patch", 200, {
        ...standalone,
        points: body.points,
      });
    }),
  );
});

function renderBuilder() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: "/teacher/tests/:id/edit", element: <TestBuilderPage /> }],
    { initialEntries: [`/teacher/tests/${TEST_ID}/edit`] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("the group's row in the builder", () => {
  it("opens the group, focuses its title and sends no request on Rename", async () => {
    const user = renderBuilder();
    await screen.findByLabelText("Điểm", undefined, { timeout: 5000 });
    await screen.findByRole("img", { name: "Bài đọc" });

    await user.click(groupMenu());
    await user.click(await screen.findByRole("menuitem", { name: "Đổi tên" }));

    const field = await screen.findByDisplayValue("Reading club");
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue("Reading club");
    expect([
      (field as HTMLInputElement).selectionStart,
      (field as HTMLInputElement).selectionEnd,
    ]).toEqual([0, "Reading club".length]);
    expect(writes).toEqual([]);
  });

  it("keeps focus in the title when Rename asks again while the group is open", async () => {
    const user = renderBuilder();
    await screen.findByRole("img", { name: "Bài đọc" }, { timeout: 5000 });
    const heading = screen
      .getAllByRole("button", { name: "Reading club" })
      .find((button) => !button.hasAttribute("aria-expanded"));
    await user.click(heading!);
    const field = await screen.findByDisplayValue("Reading club");
    expect(field).not.toHaveFocus();

    await user.click(groupMenu());
    await user.click(await screen.findByRole("menuitem", { name: "Đổi tên" }));

    await waitFor(() => expect(field).toHaveFocus());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(field).toHaveFocus();
    expect(writes).toEqual([]);
  });

  it("returns focus to the group's menu when its removal is cancelled", async () => {
    const user = renderBuilder();
    await screen.findByRole("img", { name: "Bài đọc" }, { timeout: 5000 });
    const trigger = groupMenu();

    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Xoá bài đọc này" }));
    expect(
      await screen.findByRole("dialog", { name: "Xoá bài đọc này khỏi đề?" }),
    ).toBeVisible();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(writes).toEqual([]);
  });

  it("saves a pending edit in the open question before the title opens the group", async () => {
    const user = renderBuilder();
    const points = await screen.findByLabelText("Điểm", undefined, { timeout: 5000 });
    await user.clear(points);
    await user.type(points, "7");
    expect(patches).toEqual([]);

    const heading = (
      await screen.findAllByRole("button", { name: "Reading club" })
    ).find((button) => !button.hasAttribute("aria-expanded"));
    await user.click(heading!);

    expect(await screen.findByDisplayValue("Reading club")).toBeVisible();
    expect(patches).toEqual([{ id: QUESTION_ID, points: 7 }]);
  });
});
