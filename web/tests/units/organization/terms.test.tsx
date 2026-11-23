import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useAuthStore } from "@/stores/auth";
import { contentWidth } from "@tests/support/contentWidth";
import { contractJson } from "@tests/support/contractResponse";
import { sampleTerms } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import { viewport } from "@tests/support/viewport";
import {
  BASE,
  NEW_TERM_ID,
  failure,
  overlaps,
  servesImpact,
  servesSettings,
  servesTerms,
  servesUsage,
  signInAsAdmin,
} from "./support";
import { renderSettings } from "./render";
import "@/lib/i18n";

const [spring, autumn, summer] = sampleTerms as [
  (typeof sampleTerms)[number],
  (typeof sampleTerms)[number],
  (typeof sampleTerms)[number],
];

beforeEach(() => {
  // Today is 24 September 2026, as in the deck; the picker opens on it.
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 24, 10, 0));
  contentWidth(1080);
  signInAsAdmin();
  servesImpact();
  servesSettings();
  servesUsage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useAuthStore.getState().clearSession();
  localStorage.clear();
});

const nav = () =>
  within(screen.getByRole("navigation", { name: "Mục cài đặt hệ thống" }));
const card = () => screen.getByRole("region", { name: "Học kỳ" });
/** settled waits for the settings document, after which the page stops swapping its sections. */
const settled = () =>
  screen.findByRole("textbox", { name: "Tên tổ chức", hidden: true });
const termDialog = (name: string | RegExp) => screen.getByRole("dialog", { name });

async function pick(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  field: "Bắt đầu" | "Kết thúc",
  day: string,
  month = "09",
) {
  await user.click(
    within(dialog).getByRole("button", { name: new RegExp(`^${field}`) }),
  );
  const picker = await screen.findByRole("dialog", { name: "Chọn ngày" });
  await user.click(
    within(picker).getByRole("button", {
      name: new RegExp(`ngày ${day} tháng ${month}`),
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Chọn ngày" })).toBeNull(),
  );
}

async function openMenuItem(
  user: ReturnType<typeof userEvent.setup>,
  term: string,
  item: "Sửa" | "Xoá",
) {
  await user.click(await screen.findByRole("button", { name: `Thao tác với ${term}` }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

describe("Terms in System settings", () => {
  it("is a section after Organization, at its own address, and lists the terms newest first", async () => {
    servesTerms();
    renderSettings("/admin/settings/terms");
    await settled();

    const links = nav().getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Tổ chức",
      "Học kỳ",
      "Đăng nhập",
      "Dữ liệu và quyền riêng tư",
      "Gói và mức dùng",
    ]);
    expect(nav().getByRole("link", { name: "Học kỳ" })).toHaveAttribute(
      "href",
      "/admin/settings/terms",
    );
    expect(nav().getByRole("link", { name: "Học kỳ" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(card()).getByText("Dùng cho điểm danh và sổ điểm.")).toBeVisible();
    expect(within(card()).getByRole("button", { name: "Thêm học kỳ" })).toBeVisible();

    const table = await within(card()).findByRole("table", { name: "Học kỳ" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((head) => head.textContent),
    ).toEqual(["Tên", "Bắt đầu", "Kết thúc", "Trạng thái", "Thao tác"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Xuân 202704/01/202725/04/2027Sắp tới",
      "Thu 202601/09/202620/12/2026Đang diễn ra",
      "Hè 202601/06/202622/08/2026Đã qua",
    ]);
  });

  it("reads the terms only once the section is opened", async () => {
    const seen = servesTerms();
    const user = userEvent.setup();
    renderSettings("/admin/settings/organization");
    await settled();
    expect(await screen.findByRole("textbox", { name: "Tên tổ chức" })).toBeVisible();
    expect(seen.reads).toBe(0);

    await user.click(nav().getByRole("link", { name: "Học kỳ" }));
    expect(await within(card()).findByText("Thu 2026")).toBeVisible();
    expect(seen.reads).toBe(1);
  });

  it("draws each term as two lines with its menu on a phone", async () => {
    viewport("phone");
    servesTerms();
    renderSettings("/admin/settings/terms");
    await settled();

    const list = await within(card()).findByRole("list", { name: "Học kỳ" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveTextContent("Thu 2026Đang diễn ra01/09/2026 – 20/12/2026");
    expect(
      within(items[1]!).getByRole("button", { name: "Thao tác với Thu 2026" }),
    ).toBeVisible();
    expect(within(card()).queryByRole("table")).toBeNull();
  });

  it("holds three skeleton rows while the terms are read", async () => {
    servesTerms();
    server.use(
      http.get(`${BASE}/admin/settings/terms`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return contractJson("/admin/settings/terms", "get", 200, {
          items: sampleTerms,
        });
      }),
    );
    renderSettings("/admin/settings/terms");
    await settled();

    expect(within(card()).getByRole("status", { name: "Đang tải…" })).toBeVisible();
    expect(await within(card()).findByText("Thu 2026")).toBeVisible();
    expect(within(card()).queryByRole("status")).toBeNull();
  });

  it("says when the terms could not be read, and reads them again on Retry", async () => {
    servesTerms();
    let failing = true;
    server.use(
      http.get(`${BASE}/admin/settings/terms`, () =>
        failing
          ? HttpResponse.json(failure("INTERNAL", "Lỗi máy chủ."), { status: 500 })
          : contractJson("/admin/settings/terms", "get", 200, { items: sampleTerms }),
      ),
    );
    const user = userEvent.setup();
    renderSettings("/admin/settings/terms");
    await settled();

    expect(await within(card()).findByRole("alert")).toHaveTextContent(
      "Không tải được danh sách học kỳ.",
    );
    failing = false;
    await user.click(within(card()).getByRole("button", { name: "Thử lại" }));
    expect(await within(card()).findByText("Thu 2026")).toBeVisible();
    expect(within(card()).queryByRole("alert")).toBeNull();
  });

  it("adds the first term from the empty card, and the dialog saves it itself", async () => {
    const seen = servesTerms([]);
    const user = userEvent.setup();
    renderSettings("/admin/settings/terms");
    await settled();

    expect(
      await within(card()).findByText(
        "Chưa có học kỳ nào. Tỉ lệ điểm danh tính trên mọi buổi học cho đến khi bạn thêm học kỳ.",
      ),
    ).toBeVisible();
    const buttons = within(card()).getAllByRole("button", { name: "Thêm học kỳ" });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]!);

    const dialog = termDialog("Thêm học kỳ");
    const name = within(dialog).getByRole("textbox", { name: "Tên" });
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute("placeholder", "Ví dụ: Thu 2026");
    await user.type(name, "  Thu 2026 ");
    await pick(user, dialog, "Bắt đầu", "1");
    await pick(user, dialog, "Kết thúc", "30");
    await user.click(within(dialog).getByRole("button", { name: "Thêm học kỳ" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(seen.posts).toEqual([
      { name: "Thu 2026", startsOn: "2026-09-01", endsOn: "2026-09-30" },
    ]);
    expect(await screen.findByText("Đã thêm học kỳ Thu 2026")).toBeVisible();
    const table = await within(card()).findByRole("table", { name: "Học kỳ" });
    expect(within(table).getByText("Thu 2026")).toBeVisible();
    expect(within(card()).getByRole("button", { name: "Thêm học kỳ" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).toBeNull();
    expect(seen.items.map(({ id }) => id)).toEqual([NEW_TERM_ID]);
  });

  it("asks for a name and both days before it sends anything", async () => {
    const seen = servesTerms();
    const user = userEvent.setup();
    renderSettings("/admin/settings/terms");
    await settled();
    await within(card()).findByText("Thu 2026");

    await user.click(within(card()).getByRole("button", { name: "Thêm học kỳ" }));
    const dialog = termDialog("Thêm học kỳ");
    await user.click(within(dialog).getByRole("button", { name: "Thêm học kỳ" }));

    expect(within(dialog).getAllByText("Bắt buộc")).toHaveLength(3);
    expect(within(dialog).getByRole("textbox", { name: "Tên" })).toHaveFocus();
    expect(seen.posts).toEqual([]);
  });

  it("catches an end before the start in the form, and sends nothing", async () => {
    const seen = servesTerms();
    const user = userEvent.setup();
    renderSettings("/admin/settings/terms");
    await settled();
    await within(card()).findByText("Thu 2026");

    await user.click(within(card()).getByRole("button", { name: "Thêm học kỳ" }));
    const dialog = termDialog("Thêm học kỳ");
    await user.type(within(dialog).getByRole("textbox", { name: "Tên" }), "Hè 2027");
    await pick(user, dialog, "Bắt đầu", "28");
    await pick(user, dialog, "Kết thúc", "21");

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Ngày kết thúc phải sau ngày bắt đầu.",
    );
    expect(within(dialog).getByRole("button", { name: /^Kết thúc/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      within(dialog).getByRole("button", { name: /^Bắt đầu/ }),
    ).not.toHaveAttribute("aria-invalid");
    await user.click(within(dialog).getByRole("button", { name: "Thêm học kỳ" }));
    expect(seen.posts).toEqual([]);
    expect(termDialog("Thêm học kỳ")).toBeVisible();
  });

  it("names the term a refused range overlaps, under both days, until a day changes", async () => {
    const seen = servesTerms(sampleTerms, () => overlaps(autumn));
    const user = userEvent.setup();
    renderSettings("/admin/settings/terms");
    await settled();
    await within(card()).findByText("Thu 2026");

    await user.click(within(card()).getByRole("button", { name: "Thêm học kỳ" }));
    const dialog = termDialog("Thêm học kỳ");
    await user.type(within(dialog).getByRole("textbox", { name: "Tên" }), "Đông 2026");
    await pick(user, dialog, "Bắt đầu", "28");
    await pick(user, dialog, "Kết thúc", "30");
    await user.click(within(dialog).getByRole("button", { name: "Thêm học kỳ" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Trùng với Thu 2026",
    );
    expect(seen.posts).toHaveLength(1);
    const starts = within(dialog).getByRole("button", { name: /^Bắt đầu/ });
    const ends = within(dialog).getByRole("button", { name: /^Kết thúc/ });
    expect(starts).toHaveAttribute("aria-invalid", "true");
    expect(ends).toHaveAttribute("aria-invalid", "true");
    expect(starts).toHaveAccessibleDescription("Trùng với Thu 2026");
    expect(within(dialog).getByRole("button", { name: "Thêm học kỳ" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.queryByText("Đã thêm học kỳ Đông 2026")).toBeNull();

    await pick(user, dialog, "Kết thúc", "29");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(starts).not.toHaveAttribute("aria-invalid");
  });

  it("edits a term, sends only what changed, and says repeating sessions keep their end", async () => {
    const seen = servesTerms();
    const user = userEvent.setup();
    renderSettings("/admin/settings/terms");
    await settled();
    await within(card()).findByText("Thu 2026");

    await openMenuItem(user, "Thu 2026", "Sửa");
    const dialog = termDialog("Sửa học kỳ");
    expect(within(dialog).getByRole("textbox", { name: "Tên" })).toHaveValue(
      "Thu 2026",
    );
    expect(
      within(dialog).queryByText(
        "Buổi học lặp lại đã tạo vẫn dừng ở ngày kết thúc cũ.",
      ),
    ).toBeNull();

    await pick(user, dialog, "Kết thúc", "27", "12");
    expect(
      within(dialog).getByText("Buổi học lặp lại đã tạo vẫn dừng ở ngày kết thúc cũ."),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(seen.patches).toEqual([{ id: autumn.id, body: { endsOn: "2026-12-27" } }]);
    expect(await screen.findByText("Đã lưu học kỳ Thu 2026")).toBeVisible();
    expect(await within(card()).findByText("27/12/2026")).toBeVisible();
    expect(screen.getByRole("button", { name: "Thao tác với Thu 2026" })).toHaveFocus();
  });

  it("asks before deleting a term, with what deleting it does to attendance", async () => {
    const seen = servesTerms();
    const user = userEvent.setup();
    renderSettings("/admin/settings/terms");
    await settled();
    await within(card()).findByText("Hè 2026");

    await openMenuItem(user, "Hè 2026", "Xoá");
    const confirm = screen.getByRole("alertdialog", { name: "Xoá học kỳ “Hè 2026”?" });
    expect(confirm).toHaveAccessibleDescription(
      "Khi đó, tỉ lệ điểm danh trong học kỳ này sẽ tính trên mọi buổi học.",
    );
    await user.click(within(confirm).getByRole("button", { name: "Huỷ" }));
    expect(seen.deletes).toEqual([]);
    expect(within(card()).getByText("Hè 2026")).toBeVisible();

    await openMenuItem(user, "Hè 2026", "Xoá");
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Xoá học kỳ",
      }),
    );

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(seen.deletes).toEqual([summer.id]);
    expect(await screen.findByText("Đã xoá học kỳ Hè 2026")).toBeVisible();
    expect(within(card()).queryByText("Hè 2026")).toBeNull();
    expect(within(card()).getByText(spring.name)).toBeVisible();
    expect(within(card()).getByRole("button", { name: "Thêm học kỳ" })).toHaveFocus();
  });

  it("keeps the unsaved-changes bar of the other sections off Terms", async () => {
    servesTerms();
    const user = userEvent.setup();
    renderSettings("/admin/settings/organization");
    await settled();
    const name = await screen.findByRole("textbox", { name: "Tên tổ chức" });
    await user.type(name, " HCM");
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeVisible();

    await user.click(nav().getByRole("link", { name: "Học kỳ" }));
    expect(await within(card()).findByText("Thu 2026")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).toBeNull();

    await user.click(nav().getByRole("link", { name: "Tổ chức" }));
    expect(await screen.findByRole("button", { name: "Lưu thay đổi" })).toBeVisible();
  });
});
