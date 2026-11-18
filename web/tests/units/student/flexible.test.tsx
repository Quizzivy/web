import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import AssignmentIntroPage from "@/features/assignments/pages/AssignmentIntroPage";
import StudentHomePage from "@/features/assignments/pages/StudentHomePage";
import i18n from "@/lib/i18n";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { viewport } from "@tests/support/viewport";
import { clearHeldSessions } from "@/features/take-test/heldSession";
import { useAuthStore } from "@/stores/auth";
import { ASSIGNMENT, ATTEMPT, BASE, card, detail, renderAt } from "./support";

vi.mock("@/app/modules", () => ({
  modules: {
    notifications: false,
    messages: false,
    schedule: false,
    grades: false,
    learn: false,
  },
}));

/** 17:00 on Saturday 29/08 in the app's zone. */
const NOW = new Date("2026-08-29T10:00:00Z");
/** 22:00 on Monday 31/08. */
const LATER = "2026-08-31T15:00:00Z";
const FLEXIBLE_TIMER =
  "Bài không tính giờ. Bạn có thể dừng giữa chừng rồi quay lại làm tiếp, kể cả trên thiết bị khác, trước khi bài đóng. Bài chưa nộp sẽ được nộp tự động lúc đóng.";

function introOf(over: Record<string, unknown> = {}) {
  server.use(
    http.get(`${BASE}/app/assignments/${ASSIGNMENT}`, () =>
      contractJson(
        "/app/assignments/{id}",
        "get",
        200,
        detail({ mode: "flexible", ...over }),
      ),
    ),
  );
  return renderAt(`/assignments/${ASSIGNMENT}`, [
    { path: "/assignments/:id", element: <AssignmentIntroPage /> },
    { path: "/", element: <p>home page</p> },
  ]);
}

function homeWith(dueNow: unknown[], upcoming: unknown[] = []) {
  server.use(
    http.get(`${BASE}/app/assignments`, () =>
      contractJson("/app/assignments", "get", 200, { dueNow, upcoming, completed: [] }),
    ),
    http.get(`${BASE}/app/classes`, () =>
      contractJson("/app/classes", "get", 200, { items: [] }),
    ),
  );
  return renderAt("/", [
    { path: "/", element: <StudentHomePage /> },
    { path: "/assignments/:id", element: <p>intro page</p> },
  ]);
}

function liveCard(over: Record<string, unknown> = {}) {
  return card({
    mode: "flexible",
    hasLiveAttempt: true,
    lastAttemptId: ATTEMPT,
    closesAt: LATER,
    liveDeadlineAt: LATER,
    className: "IELTS 6.5 Evening",
    questionCount: 8,
    liveAnsweredCount: 5,
    ...over,
  });
}

async function facts() {
  await screen.findByRole("heading", { level: 1 });
  return screen
    .getAllByRole("term")
    .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
}

async function rules() {
  const heading = await screen.findByRole("heading", {
    level: 2,
    name: "Trước khi bắt đầu",
  });
  return within(heading.parentElement!)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

beforeEach(() => {
  clearHeldSessions();
  viewport("desktop");
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true, now: NOW });
});

afterEach(async () => {
  vi.useRealTimers();
  useAuthStore.getState().clearSession();
  await i18n.changeLanguage("vi");
});

describe("the intro under flexible", () => {
  it("reads No timer where the time limit was", async () => {
    introOf();
    expect((await facts())[0]).toEqual(["Thời lượng", "Không tính giờ"]);
  });

  it("says the student may stop and come back before the close, and what is counted", async () => {
    introOf();
    const list = await rules();
    expect(list).toContain(FLEXIBLE_TIMER);
    expect(list.join(" ")).not.toMatch(/Đồng hồ|không dừng lại/);
    expect(list.find((line) => line?.startsWith("Khi bài đang mở"))).toMatch(
      /đều được ghi lại và giáo viên được báo\. Tạm nghỉ bằng nút .+ hay đóng trang thì không tính\.$/,
    );
    expect(list.join(" ")).not.toMatch(/được rời trang làm bài \d|nộp ngay/);
  });

  it("asks before starting with the flexible sentence and today's title and buttons", async () => {
    const user = userEvent.setup();
    introOf({ closesAt: LATER });
    await user.click(await screen.findByRole("button", { name: "Bắt đầu làm bài" }));
    const dialog = await screen.findByRole("dialog", { name: "Bắt đầu ngay?" });
    expect(dialog).toHaveTextContent(
      "Bài không tính giờ. Câu trả lời được lưu tự động, và bạn có thể dừng rồi làm tiếp trước 22:00, Thứ 2, 31/08.",
    );
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Để sau", "Bắt đầu"]);
  });

  it("names only the time for a close later today", async () => {
    const user = userEvent.setup();
    introOf();
    await user.click(await screen.findByRole("button", { name: "Bắt đầu làm bài" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "bạn có thể dừng rồi làm tiếp trước 21:00.",
    );
  });

  it("says until when an attempt in progress can be carried on", async () => {
    introOf({
      hasLiveAttempt: true,
      lastAttemptId: ATTEMPT,
      closesAt: LATER,
      liveDeadlineAt: LATER,
    });
    expect(
      await screen.findByRole("button", { name: "Tiếp tục làm bài" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Bạn làm tiếp được đến 22:00, Thứ 2, 31/08."),
    ).toBeInTheDocument();
  });

  it("says it in English", async () => {
    await act(() => i18n.changeLanguage("en"));
    introOf({
      hasLiveAttempt: true,
      lastAttemptId: ATTEMPT,
      closesAt: LATER,
      liveDeadlineAt: LATER,
    });
    expect((await facts())[0]).toEqual(["Time limit", "No timer"]);
    expect(screen.getByText(/^You can carry on until .*22:00\.$/)).toBeInTheDocument();
  });
});

describe("Home under flexible", () => {
  it("says in progress with no minutes, and the close's day, while the close is more than an hour away", async () => {
    homeWith([liveCard()]);
    expect(await screen.findByText("Đang làm")).toHaveClass("bg-info-soft");
    expect(
      screen.getByText("IELTS 6.5 Evening · 5/8 câu đã trả lời · đóng 22:00, 31/08"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Bạn đang làm dở một bài. Bài đóng lúc 22:00, 31/08."),
    ).toBeInTheDocument();
  });

  it("brings the minutes back in the last hour", async () => {
    homeWith([
      liveCard({
        liveDeadlineAt: "2026-08-29T10:42:30Z",
        closesAt: "2026-08-29T10:42:30Z",
      }),
    ]);
    expect(await screen.findByText("Đang làm · còn 42 phút")).toBeInTheDocument();
  });

  it("keeps the minutes at all times under strict", async () => {
    homeWith([liveCard({ mode: "strict", liveDeadlineAt: "2026-08-29T12:30:00Z" })]);
    expect(await screen.findByText("Đang làm · còn 150 phút")).toBeInTheDocument();
  });

  it("lists a flexible paper coming up with No timer where the minutes are", async () => {
    homeWith(
      [],
      [
        card({
          mode: "flexible",
          status: "scheduled",
          opensAt: "2026-09-02T01:00:00Z",
          closesAt: "2026-09-05T14:00:00Z",
          questionCount: 10,
          className: "IELTS Foundation A",
        }),
      ],
    );
    expect(
      await screen.findByText("IELTS Foundation A · Không tính giờ · 10 câu"),
    ).toBeInTheDocument();
  });
});
