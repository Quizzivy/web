import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import QuestionEditorPage from "@/features/question-bank/pages/teacher/QuestionEditorPage";
import { contractJson } from "@tests/support/contractResponse";
import { server } from "@tests/support/server";
import { aiOn } from "../ai/support";
import {
  BASE,
  COPY1,
  DUC,
  ME,
  Q1,
  SET_ID,
  questionSet,
  renderAt,
  serveSets,
  sets,
  signIn,
  signOut,
} from "./sets-support";

const FORK = "018f0000-0000-7000-8000-0000000000f1";
const READ_AT = "2026-11-10T03:00:00Z";
const ROUTES = [
  { path: "/teacher/question-bank/:id", element: <QuestionEditorPage /> },
  { path: "/teacher/question-bank/sets/:id", element: <p>set page</p> },
  { path: "/teacher/question-bank", element: <p>bank page</p> },
];

type Access = "owner" | "edit" | "use";

let access: Access = "owner";
let patches: { id: string; setId: string | null; body: Record<string, unknown> }[] = [];
let answer: "saved" | "fork" | "stale" | "staleUnknown" = "saved";
/** shape is what the next read of a question holds beyond the fixture's short answer. */
let shape: Record<string, unknown> = {};

/** CHOICE is a single choice with an explanation: a type with both AI entry points. */
const CHOICE = {
  type: "single_choice",
  prompt: "Choose the verb that collocates: ___ a mistake.",
  options: [
    {
      id: "018f0000-0000-7000-8000-0000000000b1",
      ordinal: 1,
      text: "do",
      isCorrect: false,
    },
    {
      id: "018f0000-0000-7000-8000-0000000000b2",
      ordinal: 2,
      text: "make",
      isCorrect: true,
    },
  ],
  explanation: "Ta nói “make a mistake”.",
};

/** LISTENING is a question with its own recording and a prompt stored as Markdown. */
const LISTENING = {
  prompt: "Nghe đoạn hội thoại, rồi trả lời: người phụ nữ **đề nghị** gì?",
  media: {
    id: "018f0000-0000-7000-8000-0000000000e1",
    kind: "audio",
    url: "https://example.test/a.mp3?sig=1",
    mimeType: "audio/mpeg",
    bytes: 1024,
    durationMs: 110_000,
    originalFilename: "unit5-listening-2.mp3",
    createdAt: "2026-01-01T00:00:00Z",
  },
  audio: { maxPlays: 2, allowSeek: false, showTranscriptAfterSubmit: true },
};

function question(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "short_answer" as const,
    level: "b1" as const,
    skill: "vocabulary" as const,
    prompt: "Give two adjectives that collocate with “rain”.",
    points: 2,
    tags: ["collocations"],
    usedInTests: 3,
    usedIn: [],
    access,
    owner: access === "owner" ? ME : DUC,
    createdAt: "2026-11-01T03:00:00Z",
    updatedAt: READ_AT,
    ...shape,
    ...overrides,
  };
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
  signIn();
  serveSets();
  access = "owner";
  patches = [];
  answer = "saved";
  shape = {};
  server.use(
    http.get(`${BASE}/teacher/questions/:id`, ({ params }) =>
      contractJson(
        "/teacher/questions/{id}",
        "get",
        200,
        question(String(params["id"])),
      ),
    ),
    http.patch(`${BASE}/teacher/questions/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const id = String(params["id"]);
      patches.push({ id, setId: new URL(request.url).searchParams.get("setId"), body });
      if (answer === "stale" || answer === "staleUnknown")
        return contractJson("/teacher/questions/{id}", "patch", 409, {
          error: {
            code: "STALE_WRITE",
            message: "Changed since you read it.",
            requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
            details: {
              updatedBy: answer === "stale" ? DUC : null,
              updatedAt: "2026-11-16T03:47:00Z",
            },
          },
        });
      return contractJson(
        "/teacher/questions/{id}",
        "patch",
        200,
        question(answer === "fork" ? FORK : id, {
          points: body["points"],
          updatedAt: "2026-11-16T04:00:00Z",
        }),
      );
    }),
  );
});

afterEach(() => {
  signOut();
  vi.useRealTimers();
});

function renderEditor(path = `/teacher/question-bank/${Q1}?set=${SET_ID}`) {
  return renderAt(path, ROUTES);
}

async function changePoints(user: ReturnType<typeof renderEditor>["user"]) {
  const settings = screen.getByRole("complementary", { name: "Cài đặt câu hỏi" });
  const points = within(settings).getByRole("spinbutton", { name: "Điểm" });
  await user.clear(points);
  await user.type(points, "3");
}

describe("the question editor for the question's owner", () => {
  it("sends the updatedAt it read, then the one its save answered", async () => {
    const { user } = renderEditor(`/teacher/question-bank/${Q1}`);
    await screen.findByRole("heading", { level: 1, name: "Sửa câu hỏi" });
    expect(screen.getByRole("button", { name: "Thao tác khác" })).toBeInTheDocument();
    expect(screen.queryByText("Phan Minh Đức")).toBeNull();

    await changePoints(user);
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({
      id: Q1,
      setId: null,
      body: { points: 3, expectedUpdatedAt: READ_AT },
    });

    await changePoints(user);
    const settings = screen.getByRole("complementary", { name: "Cài đặt câu hỏi" });
    await user.type(within(settings).getByRole("spinbutton", { name: "Điểm" }), "0");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]?.body["expectedUpdatedAt"]).toBe("2026-11-16T04:00:00Z");
  });

  it("names who saved first when the save is stale, and saves nothing more", async () => {
    answer = "stale";
    const { user } = renderEditor(`/teacher/question-bank/${Q1}`);
    await screen.findByRole("heading", { level: 1, name: "Sửa câu hỏi" });
    await changePoints(user);
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /Phan Minh Đức đã thay đổi câu hỏi này lúc \d\d:\d\d\./,
    );
    expect(alert).toHaveTextContent(
      "Tải lại để xem thay đổi của họ. Thay đổi chưa lưu ở đây sẽ mất.",
    );
    expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();

    answer = "saved";
    await user.click(within(alert).getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(patches).toHaveLength(1);
  });

  it("says the question changed elsewhere when the server names no one", async () => {
    answer = "staleUnknown";
    const { user } = renderEditor(`/teacher/question-bank/${Q1}`);
    await screen.findByRole("heading", { level: 1, name: "Sửa câu hỏi" });
    await changePoints(user);
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Câu hỏi này đã được thay đổi ở nơi khác lúc \d\d:\d\d\./,
    );
  });
});

describe("the question editor for a Can edit recipient", () => {
  beforeEach(() => {
    access = "edit";
    sets.set = questionSet({ name: "Collocations · B1", owner: DUC, access: "edit" });
  });

  it("names the owner and leads back to the set, with Save and no menu or AI", async () => {
    renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Sửa câu hỏi" });
    expect(screen.getByText("Phan Minh Đức")).toBeInTheDocument();
    expect(screen.getByText("Có thể sửa")).toBeInTheDocument();
    expect(
      screen.getByText("Thay đổi của bạn được lưu vào bản của Đức."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nếu Đức đang dùng câu này ở nơi khác, thay đổi của bạn được lưu thành một bản sao mới.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Collocations · B1" }),
    ).toHaveAttribute("href", `/teacher/question-bank/sets/${SET_ID}`);
    expect(screen.getByRole("button", { name: "Lưu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thao tác khác" })).toBeNull();
    expect(screen.queryByText(/Đang dùng trong/)).toBeNull();
  });

  it("offers no AI on a type the owner gets it on", async () => {
    aiOn();
    shape = CHOICE;
    renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Sửa câu hỏi" });
    expect(
      await screen.findByRole("textbox", { name: "Lựa chọn A" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gợi ý lựa chọn sai/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Viết bằng AI/ })).toBeNull();
  });

  it("saves in the set's context with the updatedAt it read", async () => {
    const { user } = renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Sửa câu hỏi" });
    await changePoints(user);
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({
      id: Q1,
      setId: SET_ID,
      body: { points: 3, expectedUpdatedAt: READ_AT },
    });
  });

  it("carries on with the copy when the save forks, and says why", async () => {
    answer = "fork";
    const { user, router } = renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Sửa câu hỏi" });
    await changePoints(user);
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/teacher/question-bank/${FORK}`),
    );
    expect(router.state.location.search).toBe(`?set=${SET_ID}`);
    expect(
      await screen.findByText(
        "Đã lưu thành một bản sao mới của câu hỏi này, vì Đức đang dùng câu gốc ở nơi khác.",
      ),
    ).toBeVisible();

    answer = "saved";
    await changePoints(user);
    const settings = screen.getByRole("complementary", { name: "Cài đặt câu hỏi" });
    await user.type(within(settings).getByRole("spinbutton", { name: "Điểm" }), "0");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).toMatchObject({
      id: FORK,
      body: { expectedUpdatedAt: "2026-11-16T04:00:00Z" },
    });
  });
});

describe("the question editor for a Can edit recipient outside a set", () => {
  it("reads the question and says where it can be changed, offering no Save", async () => {
    access = "edit";
    renderEditor(`/teacher/question-bank/${Q1}`);
    await screen.findByRole("heading", { level: 1, name: "Xem câu hỏi" });
    expect(screen.queryByRole("button", { name: "Lưu" })).toBeNull();
    expect(
      screen.getByText(
        "Bạn sửa được câu hỏi này khi mở nó từ bộ câu hỏi hoặc đề thi được chia sẻ với bạn.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Tạo bản sao" })).toBeInTheDocument();
    expect(screen.queryAllByRole("spinbutton")).toEqual([]);
  });
});

describe("the question editor's way back to an owner's set", () => {
  it("tells the set page the set is the reader's own", async () => {
    const { user, router } = renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Sửa câu hỏi" });
    await user.click(await screen.findByRole("link", { name: "Present perfect · A2" }));
    expect(router.state.location.pathname).toBe(
      `/teacher/question-bank/sets/${SET_ID}`,
    );
    expect(router.state.location.state).toEqual({ from: "bank" });
  });
});

describe("the question editor for a Can use recipient", () => {
  beforeEach(() => {
    access = "use";
    sets.set = questionSet({ name: "Collocations · B1", owner: DUC, access: "use" });
  });

  it("reads the question with no control to change it and no Save", async () => {
    renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Xem câu hỏi" });
    expect(screen.getByText("Có thể dùng")).toBeInTheDocument();
    expect(
      screen.getByText("Bạn xem được câu hỏi này nhưng không sửa được."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thao tác khác" })).toBeNull();
    // A control a role cannot use is not drawn for it (R7 Question Sets).
    for (const role of ["textbox", "spinbutton", "combobox", "radio", "checkbox"])
      expect(screen.queryAllByRole(role)).toEqual([]);
    expect(screen.queryByRole("radiogroup", { name: "Loại câu hỏi" })).toBeNull();
    expect(screen.getByText("Trả lời ngắn")).toBeInTheDocument();
    expect(
      screen.getByText("Give two adjectives that collocate with “rain”."),
    ).toBeVisible();
    const settings = screen.getByRole("complementary", { name: "Cài đặt câu hỏi" });
    expect(within(settings).getByText("Điểm").nextElementSibling).toHaveTextContent(
      "2",
    );
    expect(within(settings).getByText("collocations")).toBeInTheDocument();
    expect(within(settings).queryByText("thêm thẻ")).toBeNull();
  });

  it("marks a choice question's correct option and draws no way to change the options", async () => {
    aiOn();
    shape = CHOICE;
    renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Xem câu hỏi" });
    const options = screen.getByRole("list", { name: "Lựa chọn" });
    const rows = within(options).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["Ado", "BmakeĐáp án đúng"]);
    expect(screen.getByRole("region", { name: "Giải thích" })).toHaveTextContent(
      "Ta nói “make a mistake”.",
    );
    expect(screen.queryByRole("button", { name: "Thêm lựa chọn" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Xoá lựa chọn/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Gợi ý lựa chọn sai/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Viết bằng AI/ })).toBeNull();
  });

  it("renders a Markdown prompt as text and lets the question's audio play", async () => {
    shape = LISTENING;
    renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Xem câu hỏi" });
    const prompt = screen.getByRole("region", { name: "Câu hỏi" });
    expect(within(prompt).getByText("đề nghị").tagName).toBe("STRONG");
    expect(prompt).not.toHaveTextContent("**");
    expect(screen.queryByRole("button", { name: "Xem trước" })).toBeNull();

    const settings = screen.getByRole("complementary", { name: "Cài đặt câu hỏi" });
    expect(within(settings).getByText("unit5-listening-2.mp3")).toBeInTheDocument();
    expect(within(settings).getByRole("button", { name: "Phát" })).toBeEnabled();
    expect(within(settings).getByText("Hai lần")).toBeInTheDocument();
  });

  it("reads the question when the set is Can use, though another share lets the caller edit it", async () => {
    access = "edit";
    renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Xem câu hỏi" });
    expect(screen.queryByRole("button", { name: "Lưu" })).toBeNull();
    expect(
      screen.getByText("Bạn xem được câu hỏi này nhưng không sửa được."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Tạo bản sao" })).toBeInTheDocument();
    expect(screen.queryAllByRole("spinbutton")).toEqual([]);
  });

  it("makes a copy of this one question and opens it", async () => {
    const { user, router } = renderEditor();
    await screen.findByRole("heading", { level: 1, name: "Xem câu hỏi" });
    await user.click(screen.getByRole("button", { name: "Tạo bản sao" }));

    await waitFor(() =>
      expect(sets.copied).toEqual([{ id: SET_ID, body: { questionIds: [Q1] } }]),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/teacher/question-bank/${COPY1}`),
    );
    expect(
      await screen.findByText("Đã sao chép vào Ngân hàng câu hỏi của bạn"),
    ).toBeVisible();
    expect(patches).toEqual([]);
  });
});
