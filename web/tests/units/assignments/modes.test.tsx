import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { draftBody, draftOf, emptyDraft } from "@/features/assignments/draft";
import { settingsBody } from "@/features/assignments/settingsBody";
import { stepValues } from "@/features/assignments/wizardValues";
import i18n from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";
import { teacherUser } from "@tests/support/fixtures";
import {
  CLASS_A,
  TEST_ID,
  VERSIONS,
  installWizardServer,
  renderWizard,
  requests,
} from "@tests/support/assignmentWizard";
import {
  detailAssignment,
  detailRow,
  renderDetail,
  serveDetail,
} from "@tests/support/assignmentDetail";

const NOW = new Date("2026-09-01T03:20:00Z");
const AN = "018f0000-0000-7000-8000-0000000000e1";
const FLEXIBLE_HINT =
  "Không giới hạn thời gian. Học viên được nghỉ giữa chừng và làm tiếp đến giờ đóng, trên thiết bị nào cũng được. Chuyển tab hay ứng dụng khi đang mở bài vẫn được ghi lại và bạn được báo; tạm nghỉ thì không tính.";
const STRICT_HINT =
  "Có thời gian làm bài, tính từ lúc học viên bấm Bắt đầu. Bạn chọn điều xảy ra khi học viên rời bài.";
const LOCKED = "Đã có học viên làm bài, nên không đổi được kiểu làm bài.";
const READS_FLEXIBLE =
  "Bài không tính giờ. Bạn có thể dừng giữa chừng rồi quay lại làm tiếp, kể cả trên thiết bị khác, trước khi bài đóng. Bài chưa nộp sẽ được nộp tự động lúc đóng.";
const READS_LEAVING =
  "Khi bài đang mở, mỗi lần bạn chuyển sang tab hay ứng dụng khác đều được ghi lại và giáo viên được báo. Tạm nghỉ bằng nút ✕ hay đóng trang thì không tính.";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  void i18n.changeLanguage("vi");
});

function mode() {
  return screen.getByRole("group", { name: "Kiểu làm bài" });
}

function aside() {
  return within(screen.getByRole("complementary", { name: "Tóm tắt bài giao" }));
}

async function type(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  value: string,
) {
  await user.click(screen.getByRole("spinbutton", { name }));
  await user.keyboard(`{Control>}a{/Control}${value}{Enter}`);
}

function asideValue(label: string) {
  return aside().getByText(label).nextElementSibling;
}

describe("the draft's mode", () => {
  it("starts strict, or from the teacher's stored default", () => {
    expect(emptyDraft(NOW).mode).toBe("strict");
    expect(emptyDraft(NOW, { mode: "flexible" }).mode).toBe("flexible");
    expect(emptyDraft(NOW, { durationMinutes: 30 }).mode).toBe("strict");
  });

  it("is read back from a stored assignment and sent with the stored minutes and leaving rule", () => {
    const a = detailAssignment({ mode: "flexible", durationMinutes: 75 });
    const draft = draftOf(a, []);
    expect(draft.mode).toBe("flexible");
    expect(
      draftBody({
        ...draft,
        picked: {
          testId: a.testId,
          testTitle: a.testTitle,
          version: VERSIONS[TEST_ID]!,
        },
      }),
    ).toMatchObject({
      mode: "flexible",
      durationMinutes: 75,
      integrity: { maxFocusLoss: 2, onLimitExceeded: "flag" },
    });
  });

  it("is sent by Test & timing and left to the server by every other group", () => {
    const a = detailAssignment({ status: "scheduled" });
    const draft = { ...draftOf(a, []), mode: "flexible" as const };
    expect(settingsBody("timing", a, draft, "scheduled")).toMatchObject({
      mode: "flexible",
      durationMinutes: 45,
    });
    for (const group of ["window", "integrity", "results", "note"] as const)
      expect(settingsBody(group, a, draft, "scheduled")).not.toHaveProperty("mode");
  });

  it("names the mode in the schedule's line and drops the leaving count from the rules'", () => {
    const t = i18n.getFixedT("vi");
    const draft = {
      ...emptyDraft(NOW),
      opensAt: "2026-09-01T08:00",
      closesAt: "2026-09-05T21:00",
      integrity: { ...emptyDraft(NOW).integrity, maxFocusLoss: 2 },
    };
    const [, , strictSchedule, strictRules] = stepValues(draft, t, "vi");
    expect(strictSchedule).toMatch(/ · 45 phút$/);
    expect(strictRules).toContain("Được rời bài 2 lần");
    const [, , schedule, rules] = stepValues({ ...draft, mode: "flexible" }, t, "vi");
    expect(schedule).toBe(strictSchedule!.replace(/ · 45 phút$/, " · Linh hoạt"));
    expect(rules).not.toContain("Được rời bài");
    expect(
      stepValues({ ...draft, mode: "flexible" }, i18n.getFixedT("en"), "en")[2],
    ).toMatch(/ · Flexible$/);
  });
});

describe("the wizard's Mode row", () => {
  beforeEach(installWizardServer);
  afterEach(() => useAuthStore.setState({ user: null }));

  it("opens on Strict with its line and the time limit, and Flexible hides the time limit", async () => {
    const user = userEvent.setup();
    renderWizard("/teacher/assignments/new?step=3");
    const group = screen.getByRole("region", { name: "Thời gian và số lượt" });
    expect(within(mode()).getByRole("button", { name: "Nghiêm ngặt" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(mode()).getByRole("button", { name: "Nghiêm ngặt" }),
    ).toHaveAccessibleDescription(STRICT_HINT);
    expect(
      within(group).getByRole("group", { name: "Thời gian làm bài" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "60 phút" }));

    await user.click(within(mode()).getByRole("button", { name: "Linh hoạt" }));
    expect(within(mode()).getByRole("button", { name: "Linh hoạt" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(group).getByText(FLEXIBLE_HINT)).toBeVisible();
    expect(
      within(group).queryByRole("group", { name: "Thời gian làm bài" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /^Lịch/ })).toHaveTextContent(
      / · Linh hoạt/,
    );
    expect(asideValue("Thời gian làm bài")).toHaveTextContent("Đến giờ đóng");
    expect(aside().getByText(READS_FLEXIBLE)).toBeVisible();
    expect(aside().getByText(READS_LEAVING)).toBeVisible();

    await user.click(within(mode()).getByRole("button", { name: "Nghiêm ngặt" }));
    expect(screen.getByRole("button", { name: "60 phút" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(asideValue("Thời gian làm bài")).toHaveTextContent("60 phút");
  });

  it("says each attempt runs to the close under Flexible", async () => {
    const user = userEvent.setup();
    renderWizard("/teacher/assignments/new?step=3");
    await user.click(within(mode()).getByRole("button", { name: "Linh hoạt" }));
    await type(user, "Số lượt mỗi học viên", "2");
    expect(
      screen.getByText("Lấy điểm cao nhất. Mỗi lượt làm được đến giờ đóng."),
    ).toBeVisible();
    await user.click(within(mode()).getByRole("button", { name: "Nghiêm ngặt" }));
    expect(
      screen.getByText("Lấy điểm cao nhất. Mỗi lượt có thời gian làm bài riêng."),
    ).toBeVisible();
  });

  it("starts from the teacher's stored default mode", () => {
    useAuthStore.setState({
      user: {
        ...teacherUser,
        preferences: { assignmentDefaults: { mode: "flexible" } },
      },
    });
    renderWizard("/teacher/assignments/new?step=3");
    expect(within(mode()).getByRole("button", { name: "Linh hoạt" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("asks only the two switches and the short absences in Rules, with the fixed sentence", async () => {
    const user = userEvent.setup();
    renderWizard("/teacher/assignments/new?step=3");
    await user.click(within(mode()).getByRole("button", { name: "Linh hoạt" }));
    await user.click(screen.getByRole("button", { name: /^Quy định/ }));

    const integrity = screen.getByRole("region", { name: "Tính trung thực" });
    expect(
      within(integrity).getByRole("switch", { name: "Bắt buộc toàn màn hình" }),
    ).toBeVisible();
    expect(
      within(integrity).getByRole("switch", { name: "Chặn sao chép và dán" }),
    ).toBeVisible();
    expect(within(integrity).queryByRole("group", { name: "Rời khỏi bài" })).toBeNull();
    expect(
      within(integrity).queryByRole("group", { name: "Khi vượt giới hạn" }),
    ).toBeNull();
    expect(within(integrity).getByText("Rời khỏi bài")).toBeVisible();
    expect(
      within(integrity).getByText(/từ 3 giây trở lên, đều được ghi lại/),
    ).toBeVisible();
    expect(
      within(integrity).getByText(/Bài không bị tự nộp hay khoá vì việc này\.$/),
    ).toBeVisible();
    await type(user, "Bỏ qua lần rời ngắn", "4");
    expect(within(integrity).getByText(/từ 4 giây trở lên/)).toBeVisible();
    expect(
      within(integrity).getByText(
        "Trình duyệt không thể ngăn gian lận. Các quy định này ghi lại điều đã xảy ra để bạn tự quyết định.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /^Quy định/ })).not.toHaveTextContent(
      "Được rời bài",
    );
  });

  it("sends the mode with the stored minutes and leaving rule unchanged", async () => {
    const user = userEvent.setup();
    renderWizard(`/teacher/assignments/new?test=${TEST_ID}&class=${CLASS_A}&step=4`);
    await waitFor(
      () =>
        expect(screen.getByRole("button", { name: /^Học viên/ })).toHaveTextContent(
          "IELTS Foundation",
        ),
      { timeout: 5000 },
    );
    await user.click(screen.getByRole("button", { name: "Đặt giới hạn" }));
    await user.click(screen.getByRole("button", { name: "Tự nộp bài" }));
    await user.click(screen.getByRole("button", { name: /^Lịch/ }));
    await user.click(screen.getByRole("button", { name: "30 phút" }));
    await user.click(within(mode()).getByRole("button", { name: "Linh hoạt" }));
    await user.click(screen.getByRole("button", { name: /^Quy định/ }));
    await user.click(await screen.findByRole("button", { name: /^Giao cho/ }));

    await waitFor(() => expect(requests.posted).toHaveLength(1));
    expect(requests.posted[0]).toMatchObject({
      draft: false,
      mode: "flexible",
      durationMinutes: 30,
      integrity: { maxFocusLoss: 2, onLimitExceeded: "auto_submit", minAwayMs: 3000 },
    });
  });
});

describe("the Settings tab's mode", () => {
  beforeEach(() => useAuthStore.getState().setSession("token", teacherUser));

  const SCHEDULED = {
    status: "scheduled" as const,
    submittedCount: 0,
    window: {
      opensAt: "2099-09-07T01:00:00Z",
      closesAt: "2099-09-09T14:00:00Z",
      closedAt: null,
    },
  };

  function rowOf(card: HTMLElement, label: string) {
    return within(card).getByText(label, { selector: "dt" }).nextElementSibling;
  }

  it("reads Strict after the test, with the time limit under it, locked while live", async () => {
    serveDetail(detailAssignment());
    renderDetail("settings");
    const timing = await screen.findByRole("region", { name: "Đề và thời gian" });
    const labels = within(timing)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(labels).toEqual([
      "Đề thi",
      "Kiểu làm bài",
      "Thời gian làm bài",
      "Số lượt làm",
      "Thứ tự câu hỏi",
    ]);
    expect(rowOf(timing, "Kiểu làm bài")).toHaveTextContent(
      "Nghiêm ngặtCó thời gian làm bài",
    );
    expect(within(timing).getByText("Đã khóa")).toBeVisible();
    const integrity = screen.getByRole("region", { name: "Tính toàn vẹn" });
    expect(rowOf(integrity, "Rời khỏi bài")).toHaveTextContent(
      "Cho phép 2 lần, quá thì đánh dấu để xem lại",
    );
  });

  it("reads Flexible with no time limit, and the leaving rule it applies", async () => {
    serveDetail(detailAssignment({ ...SCHEDULED, mode: "flexible" }));
    renderDetail("settings");
    const timing = await screen.findByRole("region", { name: "Đề và thời gian" });
    expect(rowOf(timing, "Kiểu làm bài")).toHaveTextContent(
      "Linh hoạtLàm đến giờ đóng, được nghỉ giữa chừng",
    );
    expect(
      within(timing).queryByText("Thời gian làm bài", { selector: "dt" }),
    ).toBeNull();
    const integrity = screen.getByRole("region", { name: "Tính toàn vẹn" });
    expect(rowOf(integrity, "Rời khỏi bài")).toHaveTextContent(
      "Ghi lại từ 3 giây, và báo bạnBài Linh hoạt không giới hạn số lần rời bài và không bao giờ tự nộp bài; lần rời đầu tiên đánh dấu bài làm để bạn xem lại",
    );
    expect(rowOf(integrity, "Bỏ qua lần rời ngắn")).toHaveTextContent("3 giây");
  });

  it("changes both ways before the open and saves the mode with the stored minutes", async () => {
    const calls = serveDetail(detailAssignment({ ...SCHEDULED, mode: "flexible" }));
    const user = renderDetail("settings");
    await user.click(
      await screen.findByRole("button", { name: "Sửa Đề và thời gian" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Sửa Đề và thời gian" });
    const modes = within(dialog).getByRole("group", { name: "Kiểu làm bài" });
    expect(within(modes).getByRole("button", { name: "Linh hoạt" })).toBeEnabled();
    expect(
      within(dialog).queryByRole("group", { name: "Thời gian làm bài" }),
    ).toBeNull();
    await user.click(within(modes).getByRole("button", { name: "Nghiêm ngặt" }));
    expect(
      within(
        within(dialog).getByRole("group", { name: "Thời gian làm bài" }),
      ).getByRole("button", { name: "45 phút" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(calls.patches).toHaveLength(1), { timeout: 5_000 });
    expect(calls.patches[0]).toMatchObject({ mode: "strict", durationMinutes: 45 });
  });

  it("rests the mode once students have started, and says why", async () => {
    serveDetail(
      detailAssignment({
        mode: "flexible",
        status: "closed",
        submittedCount: 0,
        window: {
          opensAt: "2020-09-07T01:00:00Z",
          closesAt: "2020-09-09T14:00:00Z",
          closedAt: null,
        },
      }),
      { rows: [detailRow(AN, "Lê Văn An", { state: "timed_out", attemptId: AN })] },
    );
    const user = renderDetail("settings");
    await user.click(
      await screen.findByRole("button", { name: "Sửa Đề và thời gian" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Sửa Đề và thời gian" });
    const modes = within(dialog).getByRole("group", { name: "Kiểu làm bài" });
    for (const name of ["Nghiêm ngặt", "Linh hoạt"]) {
      const option = within(modes).getByRole("button", { name });
      expect(option).toBeDisabled();
      expect(option).toHaveAccessibleDescription(LOCKED);
    }
    expect(within(dialog).getByText(LOCKED)).not.toHaveClass("opacity-45");
    expect(within(dialog).getByText("Kiểu làm bài", { selector: "span" })).toHaveClass(
      "opacity-45",
    );
    expect(
      within(dialog).getByRole("spinbutton", { name: "Số lượt mỗi học viên" }),
    ).toBeEnabled();
  });

  it("shows the server's refusal in the dialog's error line when the assignment opened meanwhile", async () => {
    const calls = serveDetail(detailAssignment({ ...SCHEDULED, mode: "flexible" }), {
      patchStatus: 409,
    });
    const user = renderDetail("settings");
    await user.click(
      await screen.findByRole("button", { name: "Sửa Đề và thời gian" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Sửa Đề và thời gian" });
    await user.click(
      within(within(dialog).getByRole("group", { name: "Kiểu làm bài" })).getByRole(
        "button",
        { name: "Nghiêm ngặt" },
      ),
    );
    await user.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(calls.patches).toHaveLength(1), { timeout: 5_000 });
    expect(
      await within(dialog).findByText("Bài đang mở nên không đổi được thời gian làm."),
    ).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Sửa Đề và thời gian" })).toBeVisible();
  });
});

describe("an assignment's heading", () => {
  beforeEach(() => useAuthStore.getState().setSession("token", teacherUser));

  it("carries the Flexible chip beside the status and no minutes", async () => {
    serveDetail(detailAssignment({ mode: "flexible" }));
    renderDetail("settings");
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Unit 5 — Present perfect & listening",
    });
    const line = heading.parentElement!;
    expect(within(line).getByText("Linh hoạt")).toBeVisible();
    expect(line.lastElementChild).toHaveTextContent("Linh hoạt");
    expect(screen.getByText(/^IELTS Foundation · /)).not.toHaveTextContent("phút");
  });

  it("reads a strict assignment as it was", async () => {
    serveDetail(detailAssignment());
    renderDetail("settings");
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Unit 5 — Present perfect & listening",
    });
    expect(within(heading.parentElement!).queryByText("Linh hoạt")).toBeNull();
    expect(screen.getByText(/^IELTS Foundation · /)).toHaveTextContent(/ · 45 phút$/);
  });
});
