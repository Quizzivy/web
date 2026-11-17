import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/stores/auth";
import {
  DIRECTORY,
  DUC,
  KHOA,
  TRANG,
  VAN,
  YEN,
  grant,
  openDialog,
  serveSharing,
  signInAsOwner,
  state,
} from "./support";

beforeEach(() => {
  serveSharing();
  signInAsOwner();
});

afterEach(() => {
  toast.dismiss();
  useAuthStore.setState({ user: null, accessToken: null });
});

const dialog = () => screen.getByRole("dialog", { name: "Chia sẻ “Unit 5”" });
const picker = () =>
  screen.getByRole("combobox", { name: "Thêm giáo viên theo tên hoặc email" });
/** options names the suggestions in order, with "(disabled)" after an account that is. */
const options = () =>
  within(screen.getByRole("listbox"))
    .getAllByRole("option")
    .map((option) => {
      const person = DIRECTORY.find((p) => option.textContent.includes(p.fullName));
      return `${person?.fullName ?? option.textContent}${person?.disabled ? " (disabled)" : ""}`;
    });
const activeName = () => {
  const id = picker().getAttribute("aria-activedescendant");
  return id === null ? null : document.getElementById(id)!.textContent;
};

describe("the share dialog", () => {
  it("opens on the picker with the owner listed and the deck's words", async () => {
    await openDialog();

    expect(dialog()).toBeVisible();
    expect(picker()).toHaveFocus();
    expect(picker()).toHaveAttribute("aria-expanded", "false");
    expect(picker()).toHaveAttribute(
      "placeholder",
      "Thêm giáo viên theo tên hoặc email",
    );
    expect(
      within(dialog()).getByText("Chỉ bạn thấy cho đến khi bạn chia sẻ."),
    ).toBeVisible();
    expect(await screen.findByText("Trần Thị Bình (bạn)")).toBeVisible();
    expect(screen.getByText("Chủ sở hữu")).toBeVisible();
    expect(screen.getByText("Chưa chia sẻ với ai.")).toBeVisible();
    expect(
      screen.getByText(
        "Thêm vào đó, sửa đề và phát hành phiên bản mới. Bạn thấy thay đổi của họ.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Họ không chia sẻ tiếp và không xoá được. Kết quả của học viên vẫn nằm trong lớp của họ.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Xong" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Huỷ" })).toBeNull();
  });

  it("walks the suggestions with the arrows, skips a disabled account, and adds with Enter", async () => {
    const { user } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");

    await user.type(picker(), "v");
    await waitFor(() => expect(options()).toHaveLength(2));
    expect(options()).toEqual([KHOA.fullName, `${VAN.fullName} (disabled)`]);
    expect(screen.getByRole("option", { name: /Lý Thanh Vân/ })).toHaveTextContent(
      "Tài khoản đã vô hiệu hoá",
    );
    expect(activeName()).toContain(KHOA.fullName);
    await user.keyboard("{ArrowDown}");
    expect(activeName()).toContain(KHOA.fullName);
    await user.keyboard("{ArrowUp}");
    expect(activeName()).toContain(KHOA.fullName);

    await user.keyboard("{Enter}");
    expect(picker()).toHaveValue("");
    expect(
      within(dialog()).getByRole("button", { name: `Bỏ ${KHOA.fullName}` }),
    ).toBeVisible();
    expect(picker()).toHaveAttribute("placeholder", "Thêm nữa");
    expect(screen.getByRole("combobox", { name: "Quyền" })).toHaveTextContent(
      "Có thể dùng",
    );
    expect(screen.getByRole("switch", { name: "Gửi thông báo" })).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "Thêm lời nhắn (không bắt buộc)" }),
    ).toBeVisible();

    await user.type(picker(), "minh");
    await waitFor(() => expect(options()).toEqual([DUC.fullName]));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(
      within(dialog()).getByRole("button", { name: `Bỏ ${DUC.fullName}` }),
    ).toBeVisible();

    await user.keyboard("{Backspace}");
    expect(
      within(dialog()).queryByRole("button", { name: `Bỏ ${DUC.fullName}` }),
    ).toBeNull();
    expect(
      within(dialog()).getByRole("button", { name: `Bỏ ${KHOA.fullName}` }),
    ).toBeVisible();
  });

  it("never picks a disabled account, by click or by key", async () => {
    const { user } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");

    await user.type(picker(), "thanh");
    const row = await screen.findByRole("option", { name: /Lý Thanh Vân/ });
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(picker()).not.toHaveAttribute("aria-activedescendant");

    await user.click(row);
    await user.keyboard("{Enter}");
    expect(
      within(dialog()).queryByRole("button", { name: `Bỏ ${VAN.fullName}` }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Chia sẻ" })).toBeNull();
  });

  it("leaves out the teachers who already have access and those pending", async () => {
    state.grants = [grant(1, DUC, "edit")];
    const { user } = await openDialog();
    expect(await screen.findByText(DUC.fullName)).toBeVisible();

    await user.type(picker(), "minh");
    await waitFor(() => expect(options()).toEqual([KHOA.fullName]));
    await user.keyboard("{Enter}");
    await user.type(picker(), "minh");
    expect(
      await within(screen.getByRole("listbox")).findByText(
        "Không có giáo viên nào khớp. Bạn chỉ chia sẻ được với giáo viên ở trung tâm này.",
      ),
    ).toBeVisible();
  });

  it("closes the suggestions on Esc and the dialog on the next Esc, giving focus back", async () => {
    const { user, opener, closed } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");

    await user.type(picker(), "trang");
    await screen.findByRole("option", { name: new RegExp(TRANG.fullName) });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(picker()).toHaveAttribute("aria-expanded", "false");
    expect(dialog()).toBeVisible();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(closed.count).toBe(1);
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("lists colleagues by name when the reader clicks into an empty picker, not when the dialog opens", async () => {
    const { user } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");
    expect(state.lookups).toEqual([]);

    await user.click(picker());
    await waitFor(() =>
      expect(options()).toEqual([
        DUC.fullName,
        TRANG.fullName,
        YEN.fullName,
        KHOA.fullName,
        `${VAN.fullName} (disabled)`,
      ]),
    );
    expect(state.lookups).toEqual([""]);
    expect(picker()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(
      within(dialog()).getByRole("button", { name: `Bỏ ${TRANG.fullName}` }),
    ).toBeVisible();
  });

  it("waits 200 ms after the last keystroke and cancels a lookup the next keystroke overtakes", async () => {
    const { user } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");
    await user.click(picker());
    await screen.findByRole("option", { name: new RegExp(DUC.fullName) });
    state.lookups = [];
    state.aborted = [];

    await user.type(picker(), "yen");
    await screen.findByRole("option", { name: new RegExp(YEN.fullName) });
    expect(options()).toEqual([TRANG.fullName, YEN.fullName]);
    expect(state.lookups).toEqual(["yen"]);

    state.lookupDelay = 400;
    await user.clear(picker());
    await user.type(picker(), "do");
    await waitFor(() => expect(state.lookups).toEqual(["yen", "do"]));
    await user.type(picker(), " h");
    await waitFor(() => expect(state.aborted).toEqual(["do"]));
    expect(
      await screen.findByRole("option", { name: new RegExp(YEN.fullName) }),
    ).toBeVisible();
    expect(state.lookups).toEqual(["yen", "do", "do h"]);
  });

  it("shares with every pending teacher, toasts and stays open for more", async () => {
    const { user } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");

    await user.type(picker(), "trang");
    await screen.findByRole("option", { name: new RegExp(TRANG.fullName) });
    await user.keyboard("{Enter}");
    await user.type(picker(), "khoa");
    await screen.findByRole("option", { name: new RegExp(KHOA.fullName) });
    await user.keyboard("{Enter}");
    await user.type(
      screen.getByRole("textbox", { name: "Thêm lời nhắn (không bắt buộc)" }),
      "  Đề cho tuần sau  ",
    );
    await user.click(screen.getByRole("button", { name: "Chia sẻ" }));

    expect(
      await screen.findByText("Đã chia sẻ với 2 giáo viên. Họ sẽ nhận được thông báo."),
    ).toBeVisible();
    expect(state.created).toEqual([
      {
        kind: "test",
        resourceId: "018f0000-0000-7000-8000-0000000000a1",
        granteeIds: [TRANG.id, KHOA.id],
        access: "use",
        notify: true,
        message: "Đề cho tuần sau",
      },
    ]);
    expect(dialog()).toBeVisible();
    expect(screen.queryByText("Chưa chia sẻ với ai.")).toBeNull();
    expect(within(dialog()).getByText(TRANG.fullName)).toBeVisible();
    expect(screen.getByRole("button", { name: "Xong" })).toHaveFocus();
  });

  it("toasts why when no one could be added, and keeps their chips", async () => {
    state.skip = { [TRANG.id]: "ALREADY_SHARED", [KHOA.id]: "DISABLED" };
    const { user } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");

    for (const name of ["trang", "khoa"]) {
      await user.type(picker(), name);
      await screen.findByRole("option", { name: new RegExp(name, "i") });
      await user.keyboard("{Enter}");
    }
    await user.click(screen.getByRole("button", { name: "Chia sẻ" }));

    expect(
      await screen.findByText(`Đã có quyền truy cập: ${TRANG.fullName}`),
    ).toBeVisible();
    expect(
      screen.getByText(`Tài khoản đã vô hiệu hoá: ${KHOA.fullName}`),
    ).toBeVisible();
    expect(screen.queryByText(/Đã chia sẻ với 0/)).toBeNull();
    for (const teacher of [TRANG, KHOA])
      expect(
        within(dialog()).getByRole("button", { name: `Bỏ ${teacher.fullName}` }),
      ).toBeVisible();
  });

  it("says how many were skipped beside the success, keeping only their chips", async () => {
    state.skip = { [KHOA.id]: "NOT_A_TEACHER" };
    const { user } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");

    for (const name of ["trang", "khoa"]) {
      await user.type(picker(), name);
      await screen.findByRole("option", { name: new RegExp(name, "i") });
      await user.keyboard("{Enter}");
    }
    await user.click(screen.getByRole("button", { name: "Chia sẻ" }));

    expect(
      await screen.findByText("Đã chia sẻ với 1 giáo viên. Họ sẽ nhận được thông báo."),
    ).toBeVisible();
    expect(screen.getByText("Bỏ qua 1 người")).toBeVisible();
    expect(
      within(dialog()).getByRole("button", { name: `Bỏ ${KHOA.fullName}` }),
    ).toBeVisible();
    expect(
      within(dialog()).queryByRole("button", { name: `Bỏ ${TRANG.fullName}` }),
    ).toBeNull();
  });

  it("gives every access select one width, so the rows line up", async () => {
    state.grants = [grant(1, DUC, "edit"), grant(2, TRANG, "use")];
    await openDialog();
    await screen.findByText(TRANG.fullName);

    for (const teacher of [DUC, TRANG])
      expect(
        screen.getByRole("combobox", { name: `Quyền của ${teacher.fullName}` }),
      ).toHaveClass("w-32");
  });

  it("moves a grantee's select and Stop under the name on a phone, both 44px", async () => {
    state.grants = [grant(1, DUC, "edit")];
    await openDialog();
    await screen.findByText(DUC.fullName);

    const select = screen.getByRole("combobox", { name: `Quyền của ${DUC.fullName}` });
    const stop = screen.getByRole("button", {
      name: `Dừng chia sẻ với ${DUC.fullName}`,
    });
    // The controls share one wrapper that takes a line of its own below 768,
    // so the name column keeps the row's width on a phone.
    const controls = select.parentElement;
    expect(controls).toBe(stop.parentElement);
    expect(controls).toHaveClass("max-[767px]:basis-full", "max-[767px]:pl-11");
    expect(controls?.parentElement).toHaveClass("flex-wrap");
    // SelectTrigger's `data-[size=sm]:h-8` outranks a bare `max-[767px]:h-11`.
    expect(select).toHaveClass("max-[767px]:data-[size=sm]:h-11");
    expect(stop).toHaveClass("max-[767px]:size-11");
  });

  it("sends no message and says nothing of a notification when notify is off", async () => {
    const { user } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");

    await user.type(picker(), "yen");
    await screen.findByRole("option", { name: new RegExp(YEN.fullName) });
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("switch", { name: "Gửi thông báo" }));
    expect(
      screen.queryByRole("textbox", { name: "Thêm lời nhắn (không bắt buộc)" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Chia sẻ" }));

    expect(await screen.findByText("Đã chia sẻ với 1 giáo viên")).toBeVisible();
    expect(state.created[0]).toMatchObject({ notify: false, message: null });
  });

  it("clears the pending teachers on Cancel", async () => {
    const { user } = await openDialog();
    await screen.findByText("Chưa chia sẻ với ai.");

    await user.type(picker(), "yen");
    await screen.findByRole("option", { name: new RegExp(YEN.fullName) });
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Huỷ" }));

    expect(
      within(dialog()).queryByRole("button", { name: `Bỏ ${YEN.fullName}` }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Xong" })).toBeVisible();
    expect(state.created).toEqual([]);
  });

  it("changes a teacher's access at once and stops sharing after a danger confirm", async () => {
    state.grants = [grant(1, DUC, "edit"), grant(2, TRANG, "use")];
    const { user } = await openDialog();
    await screen.findByText(TRANG.fullName);

    await user.click(
      screen.getByRole("combobox", { name: `Quyền của ${TRANG.fullName}` }),
    );
    await user.click(await screen.findByRole("option", { name: "Có thể sửa" }));
    expect(await screen.findByText(`${TRANG.fullName} giờ có thể sửa`)).toBeVisible();
    expect(state.updated).toEqual([{ id: grant(2, TRANG, "use").id, access: "edit" }]);

    await user.click(
      screen.getByRole("button", { name: `Dừng chia sẻ với ${DUC.fullName}` }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: `Dừng chia sẻ với ${DUC.fullName}?`,
    });
    expect(
      within(confirm).getByText(
        "Họ mất quyền truy cập ngay. Các bài giao họ đã tạo từ đây vẫn hoạt động với học viên của họ.",
      ),
    ).toBeVisible();
    await user.click(within(confirm).getByRole("button", { name: "Dừng chia sẻ" }));

    expect(
      await screen.findByText(`Đã dừng chia sẻ với ${DUC.fullName}`),
    ).toBeVisible();
    expect(state.deleted).toEqual([grant(1, DUC, "edit").id]);
    expect(within(dialog()).queryByText(DUC.fullName)).toBeNull();
    expect(dialog()).toBeVisible();
  });

  it("shows bars while who has access loads, and a line with Retry when it fails", async () => {
    state.listStatus = 500;
    state.listDelay = 300;
    const { user } = await openDialog();

    expect(screen.getByRole("status", { name: "Đang tải…" })).toBeInTheDocument();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Không tải được danh sách người có quyền truy cập.",
    );
    expect(picker()).toBeEnabled();

    state.listStatus = 200;
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa chia sẻ với ai.")).toBeVisible();
  });

  it("closes with a toast when the caller may no longer share the test", async () => {
    state.listStatus = 403;
    const { closed } = await openDialog();

    expect(
      await screen.findByText("Bạn không còn quyền chia sẻ đề này."),
    ).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(closed.count).toBe(1);
  });
});
