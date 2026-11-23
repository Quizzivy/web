import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/stores/auth";
import { contentWidth } from "@tests/support/contentWidth";
import { teacherUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import { viewport } from "@tests/support/viewport";
import {
  ANH,
  BAO,
  BASE,
  CLASS_ID,
  FRIDAY_ID,
  HA,
  MONDAY_ID,
  NAM,
  TODAY_ID,
  classSession,
  failure,
  list,
  register,
  roster,
  serve,
  sessionRow,
  today,
  type SessionRow,
} from "./support";
import { renderClass } from "./render";

const TODAYS = sessionRow();
const MONDAYS = sessionRow({
  id: MONDAY_ID,
  startsAt: "2026-09-22T11:00:00Z",
  marked: true,
  counts: { present: 3, late: 1, absent: 0 },
});

/** classLists answers the class's lists: the latest with `limit=1`, else the picker's page. */
function classLists(rows: SessionRow[] = [TODAYS, MONDAYS], notMarked = 2) {
  return (query: URLSearchParams) =>
    query.get("limit") === "1"
      ? list(rows.slice(0, 1), notMarked)
      : list(rows, notMarked, "2026-09-22T11:00:00Z");
}

const MONDAY_REGISTER = register(
  roster().map((student, index) => ({
    ...student,
    status: index === 1 ? "late" : "present",
  })),
  { session: classSession({ id: MONDAY_ID, startsAt: "2026-09-22T11:00:00Z" }) },
);

function serveClass(registers = [register(), MONDAY_REGISTER], rows?: SessionRow[]) {
  return serve({ lists: classLists(rows), registers });
}

const roll = () => screen.getByRole("list", { name: "Học viên" });
const studentRow = (name: string) =>
  within(roll())
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(name) !== null)!;
const radio = (name: string, status: "Có mặt" | "Muộn" | "Vắng") =>
  within(studentRow(name)).getByRole("radio", { name: status });
const progress = () => screen.getByRole("group", { name: "Lọc theo trạng thái" });
const legend = (label: string) =>
  within(progress()).getByRole("button", { name: new RegExp(`^${label}`) });

/** opened waits for the register of today's session. */
const opened = () => screen.findByRole("list", { name: "Học viên" });

beforeEach(() => {
  today();
  useAuthStore.setState({ user: teacherUser });
});

afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useAuthStore.setState({ user: null });
});

describe("Class detail's tabs", () => {
  it("puts Overview and Attendance under the header, Attendance with the class's sessions not taken", async () => {
    const served = serveClass();
    const { user, router } = renderClass("");

    const tabs = await screen.findByRole("tablist", { name: "Các phần của lớp" });
    expect(within(tabs).getByRole("tab", { name: "Tổng quan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const attendance = await within(tabs).findByRole("tab", {
      name: "Điểm danh, 2 buổi chưa điểm danh",
    });
    expect(within(attendance).getByText("2")).toBeVisible();
    expect(Object.fromEntries(served.lists[0]!)).toEqual({
      classId: CLASS_ID,
      limit: "1",
    });

    await user.click(attendance);
    expect(router.state.location.search).toBe("?tab=attendance");
    await opened();
    expect(
      screen.getByRole("button", { name: /Th 5, 24 thg 9 · 18:00/ }),
    ).toBeVisible();
  });

  it("hides the badge when every session has its register, and has no tabs without teaching.attendance", async () => {
    serve({ lists: classLists([MONDAYS], 0), registers: [MONDAY_REGISTER] });
    renderClass("");
    const tab = await screen.findByRole("tab", { name: "Điểm danh" });
    await waitFor(() => expect(tab.querySelector("[data-slot=badge]")).toBeNull());

    useAuthStore.setState({
      user: {
        ...teacherUser,
        permissions: teacherUser.permissions.filter(
          (key) => key !== "teaching.attendance",
        ),
      },
    });
    await waitFor(() => expect(screen.queryByRole("tablist")).toBeNull());
  });
});

describe("the register", () => {
  it("opens on the latest session, with its picker, chip, search and Mark all present", async () => {
    serveClass();
    const { user, router } = renderClass();
    await opened();

    expect(screen.getByText("Chưa điểm danh")).toBeVisible();
    expect(screen.getByRole("searchbox")).toHaveAttribute(
      "placeholder",
      "Tìm học viên",
    );
    expect(
      screen.getByRole("button", { name: "Đánh dấu tất cả có mặt" }),
    ).toBeVisible();
    expect(
      screen.getByText("Đi muộn vẫn tính là có mặt trong tỉ lệ điểm danh."),
    ).toBeVisible();
    expect(screen.queryByText(/Students see their own attendance/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Th 5, 24 thg 9 · 18:00/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Buổi học")).toBeVisible();
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => [item.textContent, item.getAttribute("aria-checked")]),
    ).toEqual([
      ["Th 5, 24 thg 9 · 18:00Hôm nay", "true"],
      ["Th 3, 22 thg 9 · 18:00Đã lưu", "false"],
    ]);
    expect(within(menu).getByRole("menuitem", { name: "Tải thêm" })).toBeVisible();

    await user.click(within(menu).getByRole("menuitemradio", { name: /22 thg 9/ }));
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get("session")).toBe(
        MONDAY_ID,
      ),
    );
    expect(await screen.findByText("Đã đánh dấu đủ 4")).toBeVisible();
    expect(screen.getByText("Đã lưu")).toBeVisible();
  });

  it("counts the marks in the progress row, and filters by the legend's toggle buttons", async () => {
    serveClass();
    const { user } = renderClass();
    await opened();

    expect(screen.getByText("0/4 đã đánh dấu")).toBeVisible();
    expect(
      within(progress())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Có mặt0", "Muộn0", "Vắng0", "Chưa đánh dấu4"]);

    await user.click(radio("Trần Minh Anh", "Có mặt"));
    await user.click(radio("Lê Hoàng Nam", "Muộn"));
    expect(screen.getByText("2/4 đã đánh dấu")).toBeVisible();
    expect(radio("Trần Minh Anh", "Có mặt")).toHaveAttribute("aria-checked", "true");

    await user.click(legend("Có mặt"));
    expect(legend("Có mặt")).toHaveAttribute("aria-pressed", "true");
    expect(within(roll()).getAllByRole("listitem")).toHaveLength(1);
    expect(within(roll()).getByText("Trần Minh Anh")).toBeVisible();

    await user.click(legend("Có mặt"));
    expect(legend("Có mặt")).toHaveAttribute("aria-pressed", "false");
    expect(within(roll()).getAllByRole("listitem")).toHaveLength(4);
  });

  it("marks the rest present once some are marked, and clears a mark chosen again", async () => {
    serveClass();
    const { user } = renderClass();
    await opened();

    await user.click(radio("Nguyễn Gia Bảo", "Vắng"));
    await user.click(screen.getByRole("button", { name: "Đánh dấu còn lại có mặt" }));
    expect(screen.getByText("Đã đánh dấu đủ 4")).toBeVisible();
    expect(radio("Nguyễn Gia Bảo", "Vắng")).toHaveAttribute("aria-checked", "true");
    expect(radio("Phạm Thu Hà", "Có mặt")).toHaveAttribute("aria-checked", "true");
    expect(
      within(progress()).queryByRole("button", { name: /^Chưa đánh dấu/ }),
    ).toBeNull();

    await user.click(radio("Phạm Thu Hà", "Có mặt"));
    expect(radio("Phạm Thu Hà", "Có mặt")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("3/4 đã đánh dấu")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Đánh dấu còn lại có mặt" }));
    await user.click(screen.getByRole("button", { name: "Đánh dấu tất cả có mặt" }));
    expect(radio("Nguyễn Gia Bảo", "Có mặt")).toHaveAttribute("aria-checked", "true");
  });

  it("marks the selected students at once from the selection bar", async () => {
    serveClass();
    const { user } = renderClass();
    await opened();

    await user.click(screen.getByRole("checkbox", { name: "Chọn Trần Minh Anh" }));
    await user.click(screen.getByRole("checkbox", { name: "Chọn Lê Hoàng Nam" }));
    const all = screen.getByRole("checkbox", {
      name: "Chọn tất cả mục trên trang này",
    });
    expect(all).toHaveAttribute("aria-checked", "mixed");
    expect(screen.getByText("Đã chọn 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Đánh dấu vắng" }));
    expect(radio("Trần Minh Anh", "Vắng")).toHaveAttribute("aria-checked", "true");
    expect(radio("Lê Hoàng Nam", "Vắng")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/^Đã chọn/)).toBeNull();

    await user.click(all);
    await user.click(screen.getByRole("button", { name: "Đánh dấu muộn" }));
    expect(screen.getByText("Đã đánh dấu đủ 4")).toBeVisible();
    expect(radio("Phạm Thu Hà", "Muộn")).toHaveAttribute("aria-checked", "true");
  });

  it("takes a note only beside a mark, and saves it with the register", async () => {
    const served = serveClass();
    const { user } = renderClass();
    await opened();

    const add = within(studentRow("Trần Minh Anh")).getByRole("button", {
      name: "Ghi chú cho Trần Minh Anh",
    });
    expect(add).toBeDisabled();
    await user.click(radio("Trần Minh Anh", "Có mặt"));
    expect(add).toBeEnabled();

    await user.click(add);
    const dialog = await screen.findByRole("dialog", {
      name: "Ghi chú cho Trần Minh Anh",
    });
    expect(
      within(dialog).getByText("Chỉ bạn và giáo viên cùng lớp xem được."),
    ).toBeVisible();
    const field = within(dialog).getByRole("textbox", { name: "Ghi chú" });
    expect(field).toHaveAttribute("placeholder", "VD: Về sớm vì có hẹn khám bệnh");
    expect(field).toHaveAttribute("maxlength", "500");
    await user.type(field, "Về sớm 30 phút");
    await user.click(within(dialog).getByRole("button", { name: "Lưu ghi chú" }));

    const note = await within(studentRow("Trần Minh Anh")).findByRole("button", {
      name: /Về sớm 30 phút/,
    });
    expect(note).toHaveAttribute("title", "Về sớm 30 phút");

    await user.click(screen.getByRole("button", { name: "Đánh dấu còn lại có mặt" }));
    await user.click(screen.getByRole("button", { name: "Lưu điểm danh" }));
    await waitFor(() => expect(served.saves).toHaveLength(1));
    expect(served.saves[0]).toEqual([
      { studentId: ANH, status: "present", note: "Về sớm 30 phút" },
      { studentId: NAM, status: "present" },
      { studentId: BAO, status: "present" },
      { studentId: HA, status: "present" },
    ]);
  });

  it("asks before saving with students unmarked, saying they stay out of the rate (DG-198), and toasts the counts", async () => {
    const served = serveClass();
    const { user } = renderClass();
    await opened();

    await user.click(radio("Trần Minh Anh", "Vắng"));
    expect(
      screen.getByText("1 thay đổi chưa lưu · 3 học viên chưa đánh dấu"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Lưu điểm danh" }));

    const confirm = await screen.findByRole("dialog", {
      name: "Lưu khi còn 3 học viên chưa đánh dấu?",
    });
    expect(
      within(confirm).getByText(
        "Học viên bạn chưa đánh dấu vẫn để trống và không được tính vào tỉ lệ điểm danh.",
      ),
    ).toBeVisible();
    expect(within(confirm).queryByText(/vắng/i)).toBeNull();
    expect(served.saves).toHaveLength(0);

    await user.click(within(confirm).getByRole("button", { name: "Vẫn lưu" }));
    expect(await screen.findByText("Đã lưu điểm danh · 1 vắng, 0 muộn")).toBeVisible();
    expect(served.saves).toEqual([[{ studentId: ANH, status: "absent" }]]);
    expect(screen.getByText("Đã lưu 20:15")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Lưu điểm danh" })).toBeNull();
  });

  it("saves at once when everyone is marked, and says why a refused save failed", async () => {
    let refuse = true;
    const served = serve({
      lists: classLists(),
      registers: [register()],
      save: () =>
        refuse
          ? failure(
              "/teacher/sessions/{sessionId}/attendance",
              "put",
              422,
              "SESSION_NOT_STARTED",
            )
          : null,
    });
    const { user } = renderClass();
    await opened();

    await user.click(screen.getByRole("button", { name: "Đánh dấu tất cả có mặt" }));
    await user.click(screen.getByRole("button", { name: "Lưu điểm danh" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Buổi học này chưa bắt đầu. Điểm danh mở trước giờ học 15 phút.",
    );

    refuse = false;
    await user.click(screen.getByRole("button", { name: "Lưu điểm danh" }));
    await waitFor(() => expect(served.saves).toHaveLength(2));
    expect(await screen.findByText("Đã lưu điểm danh · 0 vắng, 0 muộn")).toBeVisible();
  });

  it("asks before unsaved marks are dropped by the tab, the session or leaving the page", async () => {
    serveClass();
    const { user, router } = renderClass();
    await opened();
    await user.click(radio("Trần Minh Anh", "Có mặt"));

    await user.click(screen.getByRole("tab", { name: "Tổng quan" }));
    let ask = await screen.findByRole("dialog", {
      name: "Bỏ điểm danh chưa lưu?",
    });
    await user.click(within(ask).getByRole("button", { name: "Ở lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.search).toBe("?tab=attendance");
    expect(radio("Trần Minh Anh", "Có mặt")).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: /Th 5, 24 thg 9 · 18:00/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: /22 thg 9/ }));
    ask = await screen.findByRole("dialog", { name: "Bỏ điểm danh chưa lưu?" });
    await user.click(within(ask).getByRole("button", { name: "Ở lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.search).toBe("?tab=attendance");

    void router.navigate("/teacher/classes");
    ask = await screen.findByRole("dialog", { name: "Bỏ điểm danh chưa lưu?" });
    await user.click(within(ask).getByRole("button", { name: "Bỏ thay đổi" }));
    expect(await screen.findByText("các lớp")).toBeVisible();
  });

  it("names the rate's column by its scope, in the danger ink under 80%", async () => {
    serveClass();
    renderClass();
    await opened();
    expect(screen.getByText("Học kỳ này")).toBeVisible();
    const rate = (name: string, text: string) =>
      within(studentRow(name)).getByText(text).parentElement;
    expect(rate("Trần Minh Anh", "100%")).toHaveClass("text-muted-fg");
    expect(rate("Nguyễn Gia Bảo", "79%")).toHaveClass("text-danger-ink");
    expect(rate("Phạm Thu Hà", "—")).toHaveClass("text-muted-fg");
    expect(rate("Phạm Thu Hà", "—")).toHaveTextContent("Học kỳ này:—");
  });

  it("reads Overall when no term holds today", async () => {
    serveClass([register(roster(), { term: null, rateScope: "overall" })]);
    renderClass();
    await opened();
    expect(screen.getByText("Toàn bộ")).toBeVisible();
    expect(screen.queryByText("Học kỳ này")).toBeNull();
  });

  it("finds no student for a search that matches none", async () => {
    serveClass();
    const { user } = renderClass();
    await opened();
    await user.type(screen.getByRole("searchbox"), "nguyen");
    expect(within(roll()).getAllByRole("listitem")).toHaveLength(1);
    await user.type(screen.getByRole("searchbox"), "x");
    expect(screen.getByText("Không có học viên nào khớp “nguyenx”")).toBeVisible();
  });

  it("says a class with no session has none yet, with a link to the calendar", async () => {
    serve({ lists: () => list([]), registers: [] });
    renderClass();
    expect(await screen.findByText("Lớp này chưa có buổi học nào.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Thêm buổi học trong Lịch" }),
    ).toHaveAttribute("href", "/teacher/calendar");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("reads only a session that has not started, saying when it opens", async () => {
    serveClass([
      register(roster(), {
        session: classSession({ id: FRIDAY_ID, startsAt: "2026-09-26T11:00:00Z" }),
      }),
    ]);
    renderClass(`?tab=attendance&session=${FRIDAY_ID}`);
    await opened();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Buổi học này chưa bắt đầu. Điểm danh mở trước giờ học 15 phút.",
    );
    expect(screen.getByText("Chưa bắt đầu")).toBeVisible();
    expect(radio("Trần Minh Anh", "Có mặt")).toBeDisabled();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Ghi chú cho/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Đánh dấu tất cả có mặt" })).toBeNull();
  });

  it("reads only a cancelled session, with its own line", async () => {
    serveClass([register(roster(), { session: classSession({ cancelled: true }) })]);
    renderClass(`?tab=attendance&session=${TODAY_ID}`);
    await opened();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Buổi học này đã bị huỷ nên không điểm danh.",
    );
    expect(screen.getByText("Đã huỷ")).toBeVisible();
    expect(radio("Phạm Thu Hà", "Vắng")).toBeDisabled();
  });

  it("shows blocks while the register loads, and Retry when it cannot", async () => {
    let fail = true;
    serve({ lists: classLists(), registers: [] });
    server.use(
      http.get(`${BASE}/teacher/sessions/:sessionId/attendance`, () =>
        fail
          ? failure("/teacher/sessions/{sessionId}/attendance", "get", 400, "INTERNAL")
          : new Promise(() => undefined),
      ),
    );
    const { user } = renderClass();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Không tải được bảng điểm danh.")).toBeVisible();
    expect(screen.getByRole("tablist")).toBeVisible();

    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("status", { name: "Đang tải…" })).toBeVisible();
  });

  it("lays the register out for a phone: no rate or column names, every control kept", async () => {
    viewport("phone");
    contentWidth(332);
    serveClass();
    renderClass();
    await opened();
    expect(screen.queryByText("Học kỳ này")).toBeNull();
    expect(screen.queryByText("Trạng thái")).toBeNull();
    expect(screen.queryByText("100%")).toBeNull();
    expect(
      within(roll()).getAllByRole("radiogroup", { name: "Điểm danh" }),
    ).toHaveLength(4);
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: "Đánh dấu tất cả có mặt" }),
    ).toBeVisible();
  });

  it("shows the rate from 640px of content, and every column name from 760", async () => {
    const width = contentWidth(700);
    serveClass();
    renderClass();
    await opened();
    expect(within(studentRow("Trần Minh Anh")).getByText("100%")).toBeVisible();
    expect(screen.queryByText("Trạng thái")).toBeNull();
    width.resize(800);
    expect(await screen.findByText("Trạng thái")).toBeVisible();
  });
});
