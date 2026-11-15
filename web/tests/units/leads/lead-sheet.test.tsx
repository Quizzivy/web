import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import { leadQuery } from "@/features/leads/api";
import { useAuthStore } from "@/stores/auth";
import { adminUser } from "@tests/support/fixtures";
import {
  REQUEST_ID,
  lead,
  leadId,
  serveAdminSummary,
  serveLeads,
} from "@tests/support/leads";
import { address, renderLeads, rowOf, sheet } from "./support";

const AN = lead("1", "Nguyễn Văn An", {
  phone: "0363216199",
  interests: ["ielts", "business"],
  courseFor: "company",
  callTime: "morning",
  locale: "en",
  createdAt: "2026-11-14T02:30:00Z",
  consentedAt: "2026-11-14T02:29:00Z",
});
const BINH = lead("2", "Trần Thị Bình", {
  status: "contacted",
  note: "Đã gọi, hẹn kiểm tra trình độ thứ Bảy.",
  handledBy: { id: adminUser.id, name: "Thuong" },
  handledAt: "2026-11-14T04:00:00Z",
});
const DUNG = lead("4", "Vũ Thuỳ Dung");
const ROWS = [AN, BINH, DUNG];

function fact(panel: HTMLElement, label: string) {
  return within(panel).getByText(label, { selector: "dt" }).nextElementSibling!;
}

const save = (panel: HTMLElement) => within(panel).getByRole("button", { name: "Lưu" });
const status = (panel: HTMLElement, name: string) =>
  within(within(panel).getByRole("group", { name: "Trạng thái" })).getByRole("button", {
    name,
  });
const note = (panel: HTMLElement) =>
  within(panel).getByRole("textbox", { name: "Ghi chú" });

function refusal(code: string, message: string, at: number) {
  return HttpResponse.json(
    { error: { code, message, requestId: REQUEST_ID } },
    { status: at },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.getState().clearSession();
});

describe("opening a request", () => {
  it("opens the sheet at the request's own address from its row, keeping the filters, and Close goes back to the list with them", async () => {
    serveLeads(ROWS);
    const { user, router } = renderLeads("/admin/leads?status=all&q=an");

    await user.click(
      within(await rowOf("Nguyễn Văn An")).getByRole("button", {
        name: /Nguyễn Văn An/,
      }),
    );

    expect(address(router)).toBe(`/admin/leads/${AN.id}?status=all&q=an`);
    const panel = await sheet();
    expect(
      await within(panel).findByRole("heading", { name: "Nguyễn Văn An" }),
    ).toBeVisible();

    await user.click(within(panel).getByRole("button", { name: "Đóng" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(address(router)).toBe("/admin/leads?status=all&q=an");
    expect(screen.getByRole("searchbox")).toHaveValue("an");
  });

  it("shows the request the notification email links to over the list, with every field, the language and the consent", async () => {
    const seen = serveLeads(ROWS);
    renderLeads(`/admin/leads/${AN.id}`);

    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });
    expect(seen.reads).toEqual([AN.id]);
    expect(await screen.findByText("Vũ Thuỳ Dung")).toBeInTheDocument();

    expect(
      within(fact(panel, "Điện thoại") as HTMLElement).getByRole("link", {
        name: "036 321 6199",
      }),
    ).toHaveAttribute("href", "tel:0363216199");
    expect(fact(panel, "Quan tâm")).toHaveTextContent("IELTSTiếng Anh thương mại");
    expect(fact(panel, "Dành cho")).toHaveTextContent("Công ty tôi");
    expect(fact(panel, "Giờ tiện gọi")).toHaveTextContent("Buổi sáng, 8:00–12:00");
    expect(fact(panel, "Nhận lúc")).toHaveTextContent("09:30, 14/11/2026");
    expect(fact(panel, "Ngôn ngữ")).toHaveTextContent("English");
    expect(fact(panel, "Đồng ý")).toHaveTextContent(
      "Thông báo 2026-11, lúc 09:29, 14/11/2026",
    );
    expect(within(panel).queryByText("Xử lý", { selector: "dt" })).toBeNull();
    expect(status(panel, "Mới")).toHaveAttribute("aria-pressed", "true");
    expect(note(panel)).toHaveValue("");
    expect(note(panel)).toHaveAttribute("maxlength", "1000");
  });

  it("says who handled a request and when, and shows its note", async () => {
    serveLeads(ROWS);
    renderLeads(`/admin/leads/${BINH.id}?status=all`);

    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Trần Thị Bình" });
    expect(fact(panel, "Xử lý")).toHaveTextContent("Thuong · 11:00, 14/11/2026");
    expect(status(panel, "Đã liên hệ")).toHaveAttribute("aria-pressed", "true");
    expect(note(panel)).toHaveValue("Đã gọi, hẹn kiểm tra trình độ thứ Bảy.");
  });

  it("says when a request was handled without a name once that account is gone", async () => {
    serveLeads([{ ...BINH, handledBy: null }]);
    renderLeads(`/admin/leads/${BINH.id}`);

    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Trần Thị Bình" });
    expect(fact(panel, "Xử lý").textContent).toBe("11:00, 14/11/2026");
  });

  it("says a request that does not exist was not found, over the list, and offers nothing to save or delete", async () => {
    serveLeads(ROWS);
    renderLeads(`/admin/leads/${leadId("999")}`);

    const panel = await sheet();
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "Không tìm thấy yêu cầu này.",
    );
    expect(within(panel).getByRole("heading")).toHaveTextContent("Yêu cầu tư vấn");
    expect(within(panel).queryByRole("button", { name: "Lưu" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Xoá" })).toBeNull();
    expect(await screen.findByText("Vũ Thuỳ Dung")).toBeInTheDocument();
  });
});

describe("saving how a request was handled", () => {
  it("keeps Save paused until something differs from what is stored", async () => {
    const seen = serveLeads(ROWS);
    const { user } = renderLeads(`/admin/leads/${BINH.id}?status=all`);
    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Trần Thị Bình" });

    expect(save(panel)).toHaveAttribute("aria-disabled", "true");
    await user.click(save(panel));
    await user.type(note(panel), "  ");
    expect(save(panel)).toHaveAttribute("aria-disabled", "true");
    await user.click(status(panel, "Đã đóng"));
    expect(save(panel)).not.toHaveAttribute("aria-disabled");
    await user.click(status(panel, "Đã liên hệ"));
    expect(save(panel)).toHaveAttribute("aria-disabled", "true");

    await user.click(save(panel));
    expect(seen.patches).toEqual([]);
  });

  it("sends the status alone when only the status changed, and shows who handled it", async () => {
    const seen = serveLeads(ROWS);
    const { user } = renderLeads(`/admin/leads/${AN.id}`);
    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });

    await user.click(status(panel, "Đã liên hệ"));
    await user.click(save(panel));

    await waitFor(() =>
      expect(seen.patches).toEqual([{ id: AN.id, body: { status: "contacted" } }]),
    );
    expect(await screen.findByText("Đã lưu yêu cầu")).toBeInTheDocument();
    await waitFor(() =>
      expect(fact(panel, "Xử lý")).toHaveTextContent("Thuong · 10:00, 15/11/2026"),
    );
    expect(save(panel)).toHaveAttribute("aria-disabled", "true");
  });

  it("sends the note alone, trimmed, when only the note changed", async () => {
    const seen = serveLeads(ROWS);
    const { user } = renderLeads(`/admin/leads/${AN.id}`);
    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });

    await user.type(note(panel), "  Gọi lại sau 17 giờ.  ");
    await user.click(save(panel));

    await waitFor(() =>
      expect(seen.patches).toEqual([
        { id: AN.id, body: { note: "Gọi lại sau 17 giờ." } },
      ]),
    );
    await waitFor(() => expect(note(panel)).toHaveValue("Gọi lại sau 17 giờ."));
  });

  it("sends both when both changed, and null for a note that was emptied", async () => {
    const seen = serveLeads(ROWS);
    const { user } = renderLeads(`/admin/leads/${BINH.id}?status=all`);
    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Trần Thị Bình" });

    await user.clear(note(panel));
    await user.click(status(panel, "Đã đóng"));
    await user.click(save(panel));

    await waitFor(() =>
      expect(seen.patches).toEqual([
        { id: BINH.id, body: { status: "closed", note: null } },
      ]),
    );
  });

  it("reads the list, the request and the sidebar's count again once saved", async () => {
    const seen = serveLeads(ROWS);
    const summary = serveAdminSummary(() => ({
      mustChangePassword: null,
      newLeads: seen.rows.filter((row) => row.status === "new").length,
    }));
    const { user } = renderLeads("/admin/leads", { shell: true });
    const nav = await screen.findByRole("navigation", { name: "Điều hướng chính" });
    await within(nav).findByRole("link", {
      name: /^Yêu cầu tư vấn\s*2 yêu cầu tư vấn mới$/,
    });
    await user.click(
      within(await rowOf("Nguyễn Văn An")).getByRole("button", {
        name: /Nguyễn Văn An/,
      }),
    );
    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });
    const before = { lists: seen.lists.length, reads: seen.reads.length };

    await user.click(status(panel, "Đã đóng"));
    await user.click(save(panel));

    await within(nav).findByRole("link", {
      name: /^Yêu cầu tư vấn\s*1 yêu cầu tư vấn mới$/,
      hidden: true,
    });
    expect(summary.asked).toBe(2);
    await waitFor(() => expect(seen.lists).toHaveLength(before.lists + 1));
    await waitFor(() => expect(seen.reads).toHaveLength(before.reads + 1));
    await waitFor(() =>
      expect(
        within(screen.getByRole("table", { hidden: true })).queryByText(
          "Nguyễn Văn An",
        ),
      ).toBeNull(),
    );
    expect(within(panel).getByRole("heading")).toHaveTextContent("Nguyễn Văn An");
  });

  it("says why a save failed, keeps what was typed and lets it be tried again", async () => {
    let fail = true;
    const seen = serveLeads(ROWS, (method) =>
      method === "patch" && fail
        ? refusal("INTERNAL", "Máy chủ gặp lỗi.", 500)
        : undefined,
    );
    const { user } = renderLeads(`/admin/leads/${AN.id}`);
    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });

    await user.type(note(panel), "Bận, gọi lại sau.");
    await user.click(save(panel));

    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "Máy chủ gặp lỗi.",
    );
    expect(note(panel)).toHaveValue("Bận, gọi lại sau.");
    expect(save(panel)).not.toHaveAttribute("aria-disabled");

    fail = false;
    await user.click(save(panel));

    await waitFor(() => expect(within(panel).queryByRole("alert")).toBeNull());
    expect(seen.patches).toHaveLength(2);
    expect(seen.rows.find((row) => row.id === AN.id)?.note).toBe("Bận, gọi lại sau.");
  });

  it("drops an edit that was not saved when the sheet closes", async () => {
    serveLeads(ROWS);
    const { user } = renderLeads("/admin/leads");
    const opener = () =>
      rowOf("Nguyễn Văn An").then((row) =>
        within(row).getByRole("button", { name: /Nguyễn Văn An/ }),
      );

    await user.click(await opener());
    let panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });
    await user.type(note(panel), "chưa lưu");
    await user.click(within(panel).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(await opener());
    panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });
    expect(note(panel)).toHaveValue("");
    expect(save(panel)).toHaveAttribute("aria-disabled", "true");
  });
});

describe("deleting a request", () => {
  it("asks first, in the words that say when to use it, and deletes nothing on Cancel", async () => {
    const seen = serveLeads(ROWS);
    const { user, router } = renderLeads(`/admin/leads/${AN.id}`);
    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });

    await user.click(within(panel).getByRole("button", { name: "Xoá" }));

    const question = await screen.findByRole("dialog", { name: "Xoá yêu cầu này?" });
    expect(question).toHaveTextContent(
      "Dùng khi người gửi đề nghị trung tâm xoá thông tin của họ.",
    );
    await user.click(within(question).getByRole("button", { name: "Huỷ" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Xoá yêu cầu này?" })).toBeNull(),
    );
    expect(seen.deletes).toEqual([]);
    expect(address(router)).toBe(`/admin/leads/${AN.id}`);
  });

  it("deletes on confirm, closes the sheet, and reads the list and the count again without the request", async () => {
    const seen = serveLeads(ROWS);
    const summary = serveAdminSummary(() => ({
      mustChangePassword: null,
      newLeads: seen.rows.filter((row) => row.status === "new").length,
    }));
    const { user, router, client } = renderLeads(`/admin/leads/${AN.id}?q=n`, {
      shell: true,
    });
    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });
    await waitFor(() => expect(seen.lists).toHaveLength(1));

    await user.click(within(panel).getByRole("button", { name: "Xoá" }));
    const question = await screen.findByRole("dialog", { name: "Xoá yêu cầu này?" });
    await user.click(within(question).getByRole("button", { name: "Xoá" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    expect(seen.deletes).toEqual([AN.id]);
    expect(address(router)).toBe("/admin/leads?q=n");
    expect(await screen.findByText("Đã xoá.")).toBeInTheDocument();
    await waitFor(async () =>
      expect(
        within(await screen.findByRole("table")).queryByText("Nguyễn Văn An"),
      ).toBeNull(),
    );
    await within(nav).findByRole("link", {
      name: /^Yêu cầu tư vấn\s*1 yêu cầu tư vấn mới$/,
    });
    expect(summary.asked).toBe(2);
    expect(seen.reads).toEqual([AN.id]);
    await waitFor(() =>
      expect(client.getQueryData(leadQuery(AN.id).queryKey)).toBeUndefined(),
    );
  });

  it("keeps the question open with the reason when the deletion fails", async () => {
    const seen = serveLeads(ROWS, (method) =>
      method === "delete" ? refusal("INTERNAL", "Máy chủ gặp lỗi.", 500) : undefined,
    );
    const { user, router } = renderLeads(`/admin/leads/${AN.id}`);
    const panel = await sheet();
    await within(panel).findByRole("heading", { name: "Nguyễn Văn An" });

    await user.click(within(panel).getByRole("button", { name: "Xoá" }));
    const question = await screen.findByRole("dialog", { name: "Xoá yêu cầu này?" });
    await user.click(within(question).getByRole("button", { name: "Xoá" }));

    expect(await within(question).findByRole("alert")).toHaveTextContent(
      "Máy chủ gặp lỗi.",
    );
    expect(seen.deletes).toEqual([AN.id]);
    expect(seen.rows).toHaveLength(ROWS.length);
    expect(address(router)).toBe(`/admin/leads/${AN.id}`);
  });
});
