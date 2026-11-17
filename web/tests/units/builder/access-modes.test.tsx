import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "msw";
import { TestStep } from "@/features/assignments/components/wizard/TestStep";
import { contractJson } from "@tests/support/contractResponse";
import { teacherUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import { installIntersectionObserver } from "@tests/support/intersection";
import { aiOn } from "../ai/support";
import { detail, renderDetail, serveDetail, testFixture } from "../tests/detailHarness";
import {
  BASE,
  DUC,
  ME,
  Q1,
  READ_AT,
  TEST_AT,
  TEST_ID,
  TRANG,
  builderTest,
  choice,
  recordWrites,
  renderBuilder,
  sent,
  serveBuilder,
  signIn,
  signOut,
  type Access,
} from "./access-support";

const NEW_ID = "018f0000-0000-7000-8000-0000000007b9";

/** outlinePatches are the outline saves the builder sent, with their bodies. */
let outlinePatches: Record<string, unknown>[] = [];
/** outlineAnswer is how the server answers the next outline save. */
let outlineAnswer: "saved" | "stale" | "gone" = "saved";

function serveOutline(access: Access) {
  server.use(
    http.patch(`${BASE}/teacher/tests/:id`, async ({ request }) => {
      outlinePatches.push((await request.json()) as Record<string, unknown>);
      if (outlineAnswer === "stale")
        return contractJson("/teacher/tests/{id}", "patch", 409, {
          error: {
            code: "STALE_WRITE",
            message: "Edited elsewhere.",
            requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
            details: { updatedBy: TRANG, updatedAt: "2026-11-16T03:47:00Z" },
          },
        });
      if (outlineAnswer === "gone")
        return contractJson("/teacher/tests/{id}", "patch", 404, {
          error: {
            code: "NOT_FOUND",
            message: "Not found.",
            requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
          },
        });
      return contractJson(
        "/teacher/tests/{id}",
        "patch",
        200,
        builderTest(access, { updatedAt: "2026-11-16T05:00:00Z" }),
      );
    }),
  );
}

function open(
  access: Access,
  permissions = teacherUser.permissions,
  overrides: Parameters<typeof builderTest>[1] = {},
) {
  signIn(permissions);
  serveBuilder(builderTest(access, overrides));
  serveOutline(access);
  return renderBuilder();
}

async function rename(user: ReturnType<typeof renderBuilder>["user"], text: string) {
  await user.click(await screen.findByRole("button", { name: "Tên đề thi" }));
  const title = screen.getByRole("textbox", { name: "Tên đề thi" });
  await user.type(title, text);
}

/**
 * The stale-write notices say "at HH:mm" for a write made today and add the
 * date for any other day, so the fixtures' 2026-11-16 times need a clock on
 * that day. Only Date is faked; timers stay real and the clock moves with them.
 */
const TODAY = new Date("2026-11-16T05:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
  recordWrites();
  outlinePatches = [];
  outlineAnswer = "saved";
});

afterEach(() => {
  signOut();
  vi.useRealTimers();
});

describe("the builder for a Can use recipient", () => {
  it("is read-only and sends nothing, with Make a copy and Assign", async () => {
    const { user } = open("use", teacherUser.permissions, {
      status: "published",
      currentVersion: 1,
      nextVersion: 2,
    });
    expect(
      await screen.findByText("Bạn xem được đề này nhưng không sửa được."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Giao đề cho lớp của bạn, hoặc tạo bản sao để sửa."),
    ).toBeVisible();
    expect(screen.getByText(DUC.name)).toBeVisible();
    expect(screen.getByText("Có thể dùng")).toBeVisible();
    expect(screen.getByRole("button", { name: "Tạo bản sao" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Giao bài" })).toHaveAttribute(
      "href",
      `/teacher/assignments/new?test=${TEST_ID}`,
    );
    expect(screen.queryByRole("button", { name: "Phát hành" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tên đề thi" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Thêm câu hỏi/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Từ ngân hàng câu hỏi" })).toBeNull();

    await user.click(await screen.findByRole("button", { name: /collocates/ }));
    expect(await screen.findByRole("heading", { name: "Câu 1" })).toBeVisible();
    expect(screen.queryByLabelText("Điểm")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(sent).toEqual([]);
    expect(outlinePatches).toEqual([]);
  });

  it("offers no AI even when the owner would get it", async () => {
    aiOn();
    open("use");
    await screen.findByText("Bạn xem được đề này nhưng không sửa được.");
    expect(screen.queryByRole("button", { name: "Kiểm tra AI" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tạo câu hỏi" })).toBeNull();
  });
});

describe("the builder for a Can edit recipient", () => {
  it("says where changes go and leaves Publish to the publish permission", async () => {
    open(
      "edit",
      teacherUser.permissions.filter((key) => key !== "content.tests.publish"),
    );
    expect(
      await screen.findByText("Thay đổi của bạn được lưu vào bản của Đức."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Câu hỏi bạn thêm vào đề cũng nằm trong ngân hàng của Đức."),
    ).toBeVisible();
    expect(screen.getByText("Có thể sửa")).toBeVisible();
    expect(screen.getByRole("button", { name: "Xem trước" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Phát hành" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tạo bản sao" })).toBeNull();
  });

  it("publishes with the permission and gets no AI", async () => {
    aiOn();
    open("edit");
    expect(await screen.findByRole("button", { name: "Phát hành" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Kiểm tra AI" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tạo câu hỏi" })).toBeNull();
  });

  it("creates a new question in the owner's bank, for this test", async () => {
    let asked: string | null = "unset";
    server.use(
      http.post(`${BASE}/teacher/questions`, ({ request }) => {
        asked = new URL(request.url).searchParams.get("forTestId");
        return contractJson("/teacher/questions", "post", 201, choice(NEW_ID));
      }),
    );
    const { user } = open("edit");
    await user.click(
      await screen.findByRole("button", { name: /^Thêm câu hỏi/ }, { timeout: 5000 }),
    );
    await waitFor(() => expect(asked).toBe(TEST_ID));
    await waitFor(() => expect(outlinePatches).toHaveLength(1), { timeout: 4000 });
    expect(JSON.stringify(outlinePatches[0])).toContain(NEW_ID);
    expect(outlinePatches[0]?.["expectedUpdatedAt"]).toBe(TEST_AT);
  });

  it("names the co-editor when a save is refused, and saves nothing more", async () => {
    outlineAnswer = "stale";
    const { user } = open("edit");
    await rename(user, " A");
    const named = await screen.findByText(
      /Nguyễn Thu Trang đã thay đổi đề này lúc \d\d:\d\d\./,
      {},
      { timeout: 4000 },
    );
    const alert = named.closest<HTMLElement>("[role=alert]")!;
    expect(alert).toHaveTextContent("Tải lại để xem thay đổi của họ.");
    expect(within(alert).getByRole("button", { name: "Tải lại" })).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: "Tên đề thi" }), "B");
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(outlinePatches).toHaveLength(1);
  });

  it("gives way to a notice when the owner stopped sharing, and sends nothing after", async () => {
    outlineAnswer = "gone";
    const { user } = open("edit");
    await rename(user, " A");
    expect(
      await screen.findByText(
        "Phan Minh Đức đã dừng chia sẻ đề này với bạn",
        {},
        { timeout: 4000 },
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Thay đổi sau lần lưu gần nhất chưa được lưu. Bài giao bạn đã tạo từ đề này vẫn hoạt động bình thường.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Về Được chia sẻ với tôi" }),
    ).toHaveAttribute("href", "/teacher/shared-with-me");
    expect(screen.queryByRole("textbox", { name: "Tên đề thi" })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(outlinePatches).toHaveLength(1);

    await user.click(screen.getByRole("link", { name: "Về Được chia sẻ với tôi" }));
    expect(await screen.findByText("shared with me")).toBeVisible();
  });
});

/** A bank question the picker lists, and the copy question-copies answers for it. */
const BANK_Q = "018f0000-0000-7000-8000-0000000007b5";
const COPY_Q = "018f0000-0000-7000-8000-0000000007b6";

function serveBank() {
  server.use(
    http.get(`${BASE}/teacher/questions`, () =>
      contractJson("/teacher/questions", "get", 200, {
        facets: {
          levels: { pre_a1: 0, a1: 0, a2: 0, b1: 0, b2: 0, c1: 0, c2: 0 },
          skills: {
            grammar: 0,
            vocabulary: 0,
            reading: 0,
            listening: 0,
            writing: 0,
            speaking: 0,
          },
          all: 1,
          single_choice: 1,
          multiple_choice: 0,
          true_false: 0,
          fill_blank: 0,
          short_answer: 0,
          tfng: 0,
          matching: 0,
          essay: 0,
        },
        tags: [],
        bankTotal: 1,
        items: [
          { ...choice(BANK_Q, { prompt: "My own bank question" }), usedInTests: 0 },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    ),
  );
}

/** questionAnswer is how the server answers the test's question edit. */
function serveQuestionEdit(
  answer: "stale-named" | "stale-unnamed" | "gone",
  onEdit: () => void = () => undefined,
) {
  server.use(
    http.patch(`${BASE}/teacher/tests/:id/questions/:questionId`, () => {
      onEdit();
      if (answer === "gone")
        return contractJson(
          "/teacher/tests/{id}/questions/{questionId}",
          "patch",
          404,
          {
            error: {
              code: "NOT_FOUND",
              message: "Not found.",
              requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
            },
          },
        );
      return contractJson("/teacher/tests/{id}/questions/{questionId}", "patch", 409, {
        error: {
          code: "STALE_WRITE",
          message: "Edited elsewhere.",
          requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
          details: {
            updatedBy: answer === "stale-named" ? TRANG : null,
            updatedAt: "2026-11-16T03:47:00Z",
          },
        },
      });
    }),
  );
}

async function editPoints(user: ReturnType<typeof renderBuilder>["user"]) {
  await user.click(
    await screen.findByRole("button", { name: /collocates/ }, { timeout: 5000 }),
  );
  const points = await screen.findByLabelText("Điểm");
  await user.clear(points);
  await user.type(points, "3");
}

describe("a Can edit recipient's other writes", () => {
  it("copies what they pick from their bank into the owner's bank first", async () => {
    installIntersectionObserver();
    serveBank();
    let copies: unknown = null;
    server.use(
      http.post(`${BASE}/teacher/tests/:id/question-copies`, async ({ request }) => {
        copies = await request.json();
        return contractJson("/teacher/tests/{id}/question-copies", "post", 201, {
          questionIds: [COPY_Q],
        });
      }),
    );
    const { user } = open("edit");
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Từ ngân hàng câu hỏi" },
        { timeout: 5000 },
      ),
    );
    const picker = await screen.findByRole("dialog", {
      name: "Thêm từ ngân hàng câu hỏi",
    });
    const row = await within(picker).findByText("My own bank question");
    await user.click(row.closest<HTMLElement>('[role="checkbox"]')!);
    await user.click(within(picker).getByRole("button", { name: "Thêm 1 câu hỏi" }));

    await waitFor(() => expect(copies).toEqual({ questionIds: [BANK_Q] }));
    expect(sent).toContain(`POST /teacher/tests/${TEST_ID}/question-copies`);
    await waitFor(() => expect(outlinePatches).toHaveLength(1), { timeout: 4000 });
    const saved = JSON.stringify(outlinePatches[0]);
    expect(saved).toContain(COPY_Q);
    expect(saved).not.toContain(BANK_Q);
  });

  it("duplicates a question into the owner's bank, for this test", async () => {
    let asked: string | null = "unset";
    server.use(
      http.post(`${BASE}/teacher/questions/:id/duplicate`, ({ request }) => {
        asked = new URL(request.url).searchParams.get("forTestId");
        return contractJson(
          "/teacher/questions/{id}/duplicate",
          "post",
          201,
          choice(NEW_ID),
        );
      }),
    );
    const { user } = open("edit");
    await user.click(
      await screen.findByRole("button", { name: /collocates/ }, { timeout: 5000 }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Thao tác với câu hỏi" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Nhân bản" }));
    await waitFor(() => expect(asked).toBe(TEST_ID));
    await waitFor(() => expect(outlinePatches).toHaveLength(1), { timeout: 4000 });
    expect(JSON.stringify(outlinePatches[0])).toContain(NEW_ID);
  });

  it("names the co-editor when a question edit is refused, with the question's sentence", async () => {
    serveQuestionEdit("stale-named");
    const { user } = open("edit");
    await editPoints(user);
    const named = await screen.findByText(
      /Nguyễn Thu Trang đã thay đổi câu hỏi này lúc \d\d:\d\d\./,
      {},
      { timeout: 4000 },
    );
    const alert = named.closest<HTMLElement>("[role=alert]")!;
    expect(alert).toHaveTextContent("Tải lại để xem thay đổi của họ.");
    expect(within(alert).getByRole("button", { name: "Tải lại" })).toBeVisible();
    expect(screen.queryByText("Bài này đang được mở ở nơi khác")).toBeNull();
  });

  it("still says when a refused question edit names nobody", async () => {
    serveQuestionEdit("stale-unnamed");
    const { user } = open("edit");
    await editPoints(user);
    const when = await screen.findByText(
      /Câu hỏi này đã được thay đổi ở nơi khác lúc \d\d:\d\d\./,
      {},
      { timeout: 4000 },
    );
    expect(when.closest("[role=alert]")).toHaveTextContent(
      "Tải lại để xem thay đổi của họ.",
    );
  });

  it("reads the test again after a 404 on a question edit, and gives way to the notice", async () => {
    let edits = 0;
    const { user } = open("edit");
    await screen.findByRole("button", { name: /collocates/ }, { timeout: 5000 });
    // Sharing stops: the question path and then the test both answer 404.
    serveQuestionEdit("gone", () => (edits += 1));
    server.use(
      http.get(`${BASE}/teacher/tests/:id`, () =>
        contractJson("/teacher/tests/{id}", "get", 404, {
          error: {
            code: "NOT_FOUND",
            message: "Not found.",
            requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
          },
        }),
      ),
    );
    await editPoints(user);
    expect(
      await screen.findByText(
        "Phan Minh Đức đã dừng chia sẻ đề này với bạn",
        {},
        { timeout: 5000 },
      ),
    ).toBeVisible();
    expect(edits).toBe(1);
    expect(outlinePatches).toEqual([]);
  });
});

describe("an admin on someone else's test", () => {
  it("writes an AI fix through the test's question path, not the bank's", async () => {
    aiOn();
    let bankPatches = 0;
    let fixed: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/teacher/ai/tests/:id/check`, () =>
        contractJson("/teacher/ai/tests/{id}/check", "post", 200, {
          findings: [
            {
              severity: "worth_a_look",
              questionId: Q1,
              number: 1,
              type: "single_choice",
              title: "Choose the verb that collocates: ___ a mistake.",
              issue: "Option A could be argued.",
              fix: {
                kind: "option_text",
                description: "Use “did”.",
                label: "Use this option",
                payload: { optionId: choice(Q1).options![0]!.id, text: "did" },
              },
            },
          ],
          usage: { credits: 400, left: 1000 },
        }),
      ),
      http.patch(`${BASE}/teacher/questions/:id`, () => {
        bankPatches += 1;
        return new Response(null, { status: 500 });
      }),
      http.patch(
        `${BASE}/teacher/tests/:id/questions/:questionId`,
        async ({ request }) => {
          fixed = (await request.json()) as Record<string, unknown>;
          return contractJson(
            "/teacher/tests/{id}/questions/{questionId}",
            "patch",
            200,
            {
              question: choice(Q1, { updatedAt: "2026-11-16T04:10:00Z" }),
              forked: false,
              testUpdatedAt: "2026-11-16T04:10:01Z",
            },
          );
        },
      ),
    );
    const { user } = open("owner", teacherUser.permissions, { owner: DUC });
    await user.click(
      await screen.findByRole("button", { name: "Kiểm tra AI" }, { timeout: 5000 }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Chạy kiểm tra" }));
    await user.click(
      await within(dialog).findByRole("button", { name: "Use this option" }),
    );
    await waitFor(() => expect(fixed).not.toBeNull());
    expect(fixed).toMatchObject({ expectedUpdatedAt: READ_AT });
    expect(
      (fixed!["options"] as { text: string }[]).map((option) => option.text),
    ).toEqual(["did", "make"]);
    expect(bankPatches).toBe(0);
  });
});

describe("the owner's builder", () => {
  it("has no access band, keeps Publish, and names who saved first", async () => {
    outlineAnswer = "stale";
    const { user } = open("owner");
    expect(await screen.findByRole("button", { name: "Phát hành" })).toBeVisible();
    expect(screen.queryByText(/Thay đổi của bạn được lưu vào bản/)).toBeNull();
    expect(screen.queryByText(DUC.name)).toBeNull();
    await rename(user, " A");
    expect(
      await screen.findByText(
        /Nguyễn Thu Trang đã thay đổi đề này lúc \d\d:\d\d\./,
        {},
        { timeout: 4000 },
      ),
    ).toBeVisible();
  });
});

describe("the builder's title bar below 1024", () => {
  // The R7 Access Modes proposal draws the title-bar buttons 44px below 1024
  // in every mode, so a bar keeps one height whatever the reader's access.
  it.each([
    ["use", ["Phiên bản", "Xem trước", "Tạo bản sao"]],
    ["edit", ["Phiên bản", "Xem trước", "Phát hành"]],
    ["owner", ["Phiên bản", "Kiểm tra AI", "Tạo câu hỏi", "Xem trước", "Phát hành"]],
  ] as const)("is 44px for %s", async (access, names) => {
    aiOn();
    open(access);
    await screen.findByRole("button", { name: "Xem trước" });
    for (const name of names) {
      const control = await screen.findByRole("button", { name });
      expect(control).toHaveClass(
        name === "Phiên bản" ? "max-[1023px]:size-11" : "max-[1023px]:h-11",
      );
    }
  });
});

describe("test detail by access", () => {
  function shared(access: Access) {
    signIn();
    serveDetail();
    detail.test = testFixture({
      access,
      owner: DUC,
      unpublishedChanges: 2,
      assignments: { live: 3, scheduled: 0, closed: 0 },
    });
    detail.versions = [
      {
        ...detail.versions[0]!,
        version: 1,
      },
      {
        ...detail.versions[0]!,
        id: "018f0000-0000-7000-8000-0000000000f2",
        version: 2,
        assignmentCount: 0,
      },
    ];
    detail.test = { ...detail.test, currentVersion: 2, nextVersion: 3 };
  }

  it("lets Can use read the history with no buttons and no publish band", async () => {
    shared("use");
    renderDetail();
    expect(await screen.findByRole("button", { name: "Tạo bản sao" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Mở trình soạn đề" })).toBeVisible();
    expect(screen.getByText(DUC.name)).toBeVisible();
    expect(screen.getByText("Có thể dùng")).toBeVisible();
    await screen.findAllByText("Phiên bản 1");
    expect(
      screen.queryByRole("button", { name: "Khôi phục thành bản nháp" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Đặt làm mặc định" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();
    expect(screen.queryByText("Bản nháp có thay đổi chưa phát hành.")).toBeNull();
    expect(screen.queryByRole("link", { name: "Sửa" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Chia sẻ/ })).toBeNull();
    expect(screen.queryByText(/đang mở/)).toBeNull();
  });

  it("keeps its header buttons 44px below 1024, as the builder's title bar", async () => {
    shared("use");
    renderDetail();
    const copy = await screen.findByRole("button", { name: "Tạo bản sao" });
    const builder = screen.getByRole("link", { name: "Mở trình soạn đề" });
    const assign = screen.getByText("Giao bài").closest("a, button");
    for (const control of [copy, builder, assign]) {
      expect(control).toHaveClass("h-9", "max-[1023px]:h-11");
    }
  });

  it("lets Can edit restore and make default but not delete", async () => {
    shared("edit");
    renderDetail();
    expect(await screen.findByRole("button", { name: "Tạo bản sao" })).toBeVisible();
    await screen.findAllByText("Phiên bản 1");
    expect(
      screen.getAllByRole("button", { name: "Khôi phục thành bản nháp" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Đặt làm mặc định" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();
    expect(screen.getByText("Bản nháp có thay đổi chưa phát hành.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Phát hành phiên bản 3" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Tạo biến thể/ })).toBeNull();
  });

  it("keeps every version button for the owner", async () => {
    signIn();
    serveDetail();
    detail.test = testFixture({ owner: ME, currentVersion: 2, nextVersion: 3 });
    detail.versions = [
      detail.versions[0]!,
      {
        ...detail.versions[0]!,
        id: "018f0000-0000-7000-8000-0000000000f2",
        version: 2,
      },
    ];
    renderDetail();
    expect(
      await screen.findByRole("button", { name: "Đặt làm mặc định" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Xoá" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Tạo bản sao" })).toBeNull();
  });
});

describe("the wizard's test step", () => {
  it("lists shared tests too, saying who shared each", async () => {
    signIn();
    let include: string | null = null;
    const mine = builderTest("owner", { status: "published", currentVersion: 1 });
    const theirs = builderTest("use", {
      id: "018f0000-0000-7000-8000-0000000007a2",
      title: "Unit 8 · Listening",
      status: "published",
      currentVersion: 1,
    });
    server.use(
      http.get(`${BASE}/teacher/tests`, ({ request }) => {
        include = new URL(request.url).searchParams.get("include");
        return contractJson("/teacher/tests", "get", 200, {
          items: [mine, theirs],
          total: 2,
          page: 1,
          pageSize: 20,
          facets: { all: 2, draft: 0, published: 2, archived: 0 },
          tags: [],
        });
      }),
      http.get(`${BASE}/teacher/tests/:id/versions`, () =>
        contractJson("/teacher/tests/{id}/versions", "get", 200, {
          items: [
            {
              id: "018f0000-0000-7000-8000-0000000000f1",
              version: 1,
              totalPoints: 2,
              questionCount: 4,
              skills: [],
              audioCount: 0,
              manualCount: 0,
              assignmentCount: 0,
              changeNote: null,
              publishedAt: "2026-11-02T03:00:00Z",
              publishedBy: DUC.name,
            },
          ],
        }),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TestStep picked={null} onPick={() => undefined} />
      </QueryClientProvider>,
    );
    const shared = await screen.findByRole("radio", { name: /Unit 8 · Listening/ });
    await waitFor(() =>
      expect(shared).toHaveTextContent("Được chia sẻ bởi Phan Minh Đức"),
    );
    expect(include).toBe("shared");
    expect(
      screen.getByRole("radio", { name: /Unit 7 · Reading/ }),
    ).not.toHaveTextContent("Được chia sẻ bởi");
  });
});
