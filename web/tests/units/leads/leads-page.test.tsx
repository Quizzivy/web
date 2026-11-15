import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import i18n from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";
import { REQUEST_ID, lead, serveLeads } from "@tests/support/leads";
import { server } from "@tests/support/server";
import { TABLE, address, renderLeads, rowOf, table } from "./support";

const BASE = "http://localhost:8080";

const AN = lead("1", "Nguyễn Văn An", {
  phone: "0363216199",
  interests: ["ielts", "communication"],
  courseFor: "child",
  callTime: "evening",
});
const BINH = lead("2", "Trần Thị Bình", { status: "contacted", interests: [] });
const CUONG = lead("3", "Lê Quốc Cường", { status: "closed", phone: "84901234567" });
const DUNG = lead("4", "Vũ Thuỳ Dung");
const ROWS = [AN, BINH, CUONG, DUNG];

const tab = (name: string) =>
  within(screen.getByRole("group", { name: "Trạng thái" })).getByRole("button", {
    name,
  });

function crowd(count: number) {
  return Array.from({ length: count }, (_, index) =>
    lead(String(index + 1), `Khách ${index + 1}`),
  );
}

afterEach(async () => {
  vi.unstubAllGlobals();
  useAuthStore.getState().clearSession();
  await act(() => i18n.changeLanguage("vi"));
});

describe("the status tabs and the URL", () => {
  it("opens on New with nothing in the URL, and asks for the new requests only", async () => {
    const seen = serveLeads(ROWS);
    const { router } = renderLeads();

    expect(await rowOf("Nguyễn Văn An")).toBeInTheDocument();
    expect(tab("Mới")).toHaveAttribute("aria-pressed", "true");
    expect(address(router)).toBe("/admin/leads");
    expect(seen.lists.at(-1)?.get("status")).toBe("new");
    expect(within(await table()).queryByText("Trần Thị Bình")).toBeNull();
  });

  it("writes Contacted and Closed to the URL and the request, and All as a tab that sends no status", async () => {
    const seen = serveLeads(ROWS);
    const { user, router } = renderLeads();
    await rowOf("Nguyễn Văn An");

    await user.click(tab("Đã liên hệ"));
    expect(address(router)).toBe("/admin/leads?status=contacted");
    expect(await rowOf("Trần Thị Bình")).toBeInTheDocument();
    expect(seen.lists.at(-1)?.get("status")).toBe("contacted");

    await user.click(tab("Đã đóng"));
    expect(address(router)).toBe("/admin/leads?status=closed");
    expect(await rowOf("Lê Quốc Cường")).toBeInTheDocument();

    await user.click(tab("Tất cả"));
    expect(address(router)).toBe("/admin/leads?status=all");
    await waitFor(async () =>
      expect(within(await table()).getAllByRole("row")).toHaveLength(ROWS.length + 1),
    );
    expect(seen.lists.at(-1)?.has("status")).toBe(false);
  });

  it("takes the tab out of the URL when New is chosen again", async () => {
    serveLeads(ROWS);
    const { user, router } = renderLeads("/admin/leads?status=closed");
    await rowOf("Lê Quốc Cường");

    await user.click(tab("Mới"));

    expect(address(router)).toBe("/admin/leads");
    expect(await rowOf("Vũ Thuỳ Dung")).toBeInTheDocument();
  });

  it("reads the tab from the URL, and New for a status it does not know", async () => {
    serveLeads(ROWS);
    renderLeads("/admin/leads?status=archived");

    expect(await rowOf("Nguyễn Văn An")).toBeInTheDocument();
    expect(tab("Mới")).toHaveAttribute("aria-pressed", "true");
  });

  it("goes back to the first page when the tab changes", async () => {
    const seen = serveLeads(crowd(25));
    const { user, router } = renderLeads("/admin/leads?page=2");
    await rowOf("Khách 11");

    await user.click(tab("Tất cả"));

    await waitFor(() => expect(address(router)).toBe("/admin/leads?status=all"));
    await waitFor(() => expect(seen.lists.at(-1)?.get("page")).toBeNull());
  });
});

describe("the search box and the URL", () => {
  it("keeps what is typed out of the URL and the request until the typing pauses, then sends it as q beside the tab", async () => {
    const seen = serveLeads(ROWS);
    const { user, router } = renderLeads("/admin/leads?status=all");
    await rowOf("Nguyễn Văn An");
    const before = seen.lists.length;
    const box = screen.getByRole("searchbox", {
      name: "Tìm theo tên hoặc số điện thoại",
    });

    await user.type(box, " bình ");
    expect(address(router)).toBe("/admin/leads?status=all");
    expect(seen.lists).toHaveLength(before);

    await waitFor(() =>
      expect(router.state.location.search).toBe(
        `?status=all&q=${encodeURIComponent("bình")}`,
      ),
    );
    await waitFor(() => expect(seen.lists.at(-1)?.get("q")).toBe("bình"));
    expect(seen.lists.at(-1)?.has("status")).toBe(false);
    expect(await rowOf("Trần Thị Bình")).toBeInTheDocument();
    expect(within(await table()).getAllByRole("row")).toHaveLength(2);
  });

  it("fills the box from the URL and searches a phone number by its digits", async () => {
    const seen = serveLeads(ROWS);
    renderLeads("/admin/leads?status=all&q=0363");

    expect(await rowOf("Nguyễn Văn An")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("0363");
    expect(seen.lists.at(-1)?.get("q")).toBe("0363");
  });

  it("says that nothing matches a search, and that there are no requests yet without one", async () => {
    serveLeads([BINH]);
    const { router } = renderLeads("/admin/leads?q=khong-co");

    expect(await screen.findByText("Không có yêu cầu phù hợp.")).toBeInTheDocument();

    await act(() => router.navigate("/admin/leads"));
    expect(await screen.findByText("Chưa có yêu cầu tư vấn nào.")).toBeInTheDocument();
  });
});

describe("the table of requests", () => {
  it("draws the seven columns at full width, the phone as a tel link and the interests as chips", async () => {
    serveLeads(ROWS);
    renderLeads();

    const row = await rowOf("Nguyễn Văn An");
    expect(
      within(await table())
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      "Họ tên",
      "Điện thoại",
      "Quan tâm",
      "Dành cho",
      "Giờ tiện gọi",
      "Nhận lúc",
      "Trạng thái",
    ]);
    const phone = within(row).getByRole("link", { name: "036 321 6199" });
    expect(phone).toHaveAttribute("href", "tel:0363216199");
    expect(
      within(row).getByText("IELTS").closest("[data-slot='badge']"),
    ).not.toBeNull();
    expect(within(row).getByText("Giao tiếp")).toBeInTheDocument();
    expect(within(row).getByText("Con tôi")).toBeInTheDocument();
    expect(within(row).getByText("Buổi tối, 18:00–20:00")).toBeInTheDocument();
    expect(within(row).getByText("Mới")).toBeInTheDocument();
  });

  it("shows when a request came as a short relative time, with the exact moment on hover", async () => {
    serveLeads([AN]);
    renderLeads();

    const time = (await rowOf("Nguyễn Văn An")).querySelector("time")!;
    expect(time).toHaveTextContent("3 giờ trước");
    expect(time).toHaveAttribute("datetime", AN.createdAt);
    expect(time.title).toMatch(/^\d{2}:\d{2}, \d{2}\/\d{2}\/\d{4}$/);
  });

  it("leaves a number that is not a ten-digit Vietnamese one as it is stored", async () => {
    serveLeads(ROWS);
    renderLeads("/admin/leads?status=closed");

    const row = await rowOf("Lê Quốc Cường");
    expect(within(row).getByRole("link", { name: "84901234567" })).toHaveAttribute(
      "href",
      "tel:84901234567",
    );
  });

  it("folds the columns that do not fit under the name", async () => {
    serveLeads(ROWS);
    renderLeads("/admin/leads", { width: 600 });

    const row = await rowOf("Nguyễn Văn An");
    expect(
      within(await table())
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Họ tên", "Điện thoại", "Trạng thái"]);
    expect(
      within(row).getByText(
        "IELTS, Giao tiếp · Con tôi · Buổi tối, 18:00–20:00 · 3 giờ trước",
      ),
    ).toBeInTheDocument();
  });

  it("is a list of cards below 560px of content, each opening its request", async () => {
    serveLeads(ROWS);
    const { user, router } = renderLeads("/admin/leads", { width: 559 });

    const list = await screen.findByRole("list", { name: TABLE });
    expect(screen.queryByRole("table")).toBeNull();
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText("036 321 6199")).toBeInTheDocument();
    expect(within(cards[0]!).queryByRole("link")).toBeNull();

    await user.click(within(cards[0]!).getByRole("button"));
    expect(address(router)).toBe(`/admin/leads/${AN.id}`);
  });

  it("pages the list, ten requests at a time", async () => {
    const seen = serveLeads(crowd(25));
    const { user, router } = renderLeads();
    await rowOf(/^Khách 1$/);

    expect(seen.lists.at(-1)?.get("limit")).toBe("10");
    expect(screen.getByText("1–10 trên 25 yêu cầu")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Trang sau" }));
    expect(address(router)).toBe("/admin/leads?page=2");
    expect(await rowOf("Khách 11")).toBeInTheDocument();
    expect(seen.lists.at(-1)?.get("page")).toBe("2");
  });
});

describe("the states of the list", () => {
  it("stands a skeleton in for the table until the first page arrives", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen = serveLeads(ROWS);
    server.use(
      http.get(`${BASE}/admin/leads`, async () => {
        await held;
      }),
    );
    renderLeads();

    expect(await screen.findByRole("status", { name: "Đang tải…" })).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();

    release();
    expect(await rowOf("Nguyễn Văn An")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Đang tải…" })).toBeNull();
    expect(seen.lists).toHaveLength(1);
  });

  it("says the list could not be loaded, and reads it again on Retry", async () => {
    const seen = serveLeads(ROWS);
    let fail = true;
    server.use(
      http.get(`${BASE}/admin/leads`, () =>
        fail
          ? HttpResponse.json(
              {
                error: { code: "INTERNAL", message: "Lỗi.", requestId: REQUEST_ID },
              },
              { status: 500 },
            )
          : undefined,
      ),
    );
    const { user } = renderLeads();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Không tải được danh sách yêu cầu.");
    expect(seen.lists).toHaveLength(0);

    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }));

    expect(await rowOf("Nguyễn Văn An")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names the page and says who is on it", async () => {
    serveLeads(ROWS);
    renderLeads();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Yêu cầu tư vấn" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Những người đã nhờ trung tâm gọi lại."),
    ).toBeInTheDocument();
  });

  it("is worded in English too", async () => {
    serveLeads(ROWS);
    renderLeads();
    await rowOf("Nguyễn Văn An");

    await act(() => i18n.changeLanguage("en"));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Consultation requests" }),
    ).toBeInTheDocument();
    const row = within(
      screen.getByRole("table", { name: "Consultation requests" }),
    ).getByRole("row", { name: /Nguyễn Văn An/ });
    expect(screen.getByText("People who asked us to call them back.")).toBeVisible();
    expect(
      within(screen.getByRole("group", { name: "Status" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["New", "Contacted", "Closed", "All"]);
    expect(within(row).getByText("Communication")).toBeInTheDocument();
    expect(within(row).getByText("My child")).toBeInTheDocument();
    expect(within(row).getByText("Evening, 18:00–20:00")).toBeInTheDocument();
  });
});
