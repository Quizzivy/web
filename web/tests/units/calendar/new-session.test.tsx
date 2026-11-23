import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { TFunction } from "i18next";
import { NewSessionDialog } from "@/features/calendar/components/NewSessionDialog";
import {
  followClass,
  newSessionDefaults,
  repeatHint,
  validateNewSession,
} from "@/features/calendar/newSession";
import type { CalendarTerm } from "@/features/calendar/api";
import { Toaster } from "@/components/ui/sonner";
import i18n from "@/lib/i18n";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { deckClass, deckSession } from "@tests/support/calendar";

const BASE = "http://localhost:8080";
const TODAY = "2025-09-24";
const TERM: CalendarTerm = {
  id: "019535d9-3df7-79fb-b466-fa907fa170f1",
  name: "Học kỳ 1",
  startsOn: "2025-09-01",
  endsOn: "2025-12-19",
};
const CLASSES = [deckClass("evening"), deckClass("foundation"), deckClass("toeic")];

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const t = i18n.t.bind(i18n) as TFunction;

function serveClasses(items = CLASSES) {
  server.use(
    http.get(`${BASE}/teacher/classes`, () =>
      contractJson("/teacher/classes", "get", 200, {
        items,
        page: 1,
        pageSize: 100,
        total: items.length,
        facets: {
          all: items.length,
          joinable: items.length,
          archived: 0,
          students: 36,
        },
      }),
    ),
  );
}

function open(terms: readonly CalendarTerm[] = [TERM], termsFrom = "2025-09-22") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <NewSessionDialog
        open
        onOpenChange={onOpenChange}
        today={TODAY}
        terms={terms}
        termsFrom={termsFrom}
      />
      <Toaster />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

/** dialog waits for the classes, which the form opens on, and returns it. */
async function dialog(name = "Buổi học mới") {
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog", { name })).getByRole("combobox"),
    ).not.toBeDisabled(),
  );
  return screen.getByRole("dialog", { name });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2025-09-24T13:15:00Z"));
});

afterEach(async () => {
  vi.useRealTimers();
  await act(() => i18n.changeLanguage("vi"));
});

describe("New session: the deck's form and its defaults", () => {
  it("opens on the first class with its room, today, 18:00, 90 minutes, every week until the term ends", async () => {
    serveClasses();
    open();
    const form = await dialog();
    expect(within(form).getByRole("combobox")).toHaveTextContent("IELTS 6.5 Evening");
    expect(within(form).getByRole("button", { name: /^Bắt đầu/ })).toHaveTextContent(
      "18:00",
    );
    expect(within(form).getByRole("button", { name: /^Ngày/ })).toHaveTextContent(
      "2025",
    );
    expect(
      within(within(form).getByRole("group", { name: "Thời lượng" }))
        .getAllByRole("button")
        .map((button) => [button.textContent, button.getAttribute("aria-pressed")]),
    ).toEqual([
      ["60 phút", "false"],
      ["90 phút", "true"],
      ["120 phút", "false"],
    ]);
    const room = within(form).getByRole("textbox", { name: /Phòng/ });
    expect(room).toHaveValue("Phòng 2");
    expect(room).toHaveAttribute("placeholder", "Phòng 2");
    expect(
      within(form).getByRole("switch", { name: "Lặp lại mỗi tuần" }),
    ).toBeChecked();
    expect(form).toHaveTextContent("Đến hết 19 thg 12");
    expect(
      within(form).getByRole("button", { name: "Thêm buổi học" }),
    ).toBeInTheDocument();
  });

  it("follows the chosen class's room until the teacher types another", async () => {
    serveClasses();
    open();
    const form = await dialog();
    const user = userEvent.setup();
    await user.click(within(form).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "IELTS Foundation A" }));
    const room = within(form).getByRole("textbox", { name: /Phòng/ });
    expect(room).toHaveValue("Phòng 1");
    await user.clear(room);
    await user.type(room, "Phòng 5");
    await user.click(within(form).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "TOEIC 600 Weekend" }));
    expect(room).toHaveValue("Phòng 5");
  });

  it("says Đến khi bạn dừng lặp lại with no term, and nothing once Repeat is off", async () => {
    serveClasses();
    open([]);
    const form = await dialog();
    expect(form).toHaveTextContent("Đến khi bạn dừng lặp lại");
    await userEvent
      .setup()
      .click(within(form).getByRole("switch", { name: "Lặp lại mỗi tuần" }));
    expect(form).not.toHaveTextContent("Đến khi bạn dừng lặp lại");
  });

  it("reads the terms from today on when the shown week starts later", async () => {
    serveClasses();
    let asked: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/teacher/calendar`, ({ request }) => {
        asked = new URL(request.url).searchParams;
        return contractJson("/teacher/calendar", "get", 200, {
          sessions: [],
          assignmentEvents: [],
          terms: [TERM],
        });
      }),
    );
    open([], "2025-12-22");
    const form = await dialog();
    await waitFor(() => expect(form).toHaveTextContent("Đến hết 19 thg 12"));
    expect(asked!.get("from")).toBe(TODAY);
    expect(asked!.get("to")).toBe("2025-09-25");
  });

  it("says why a class with no class to choose cannot take a session", async () => {
    serveClasses([]);
    open();
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Buổi học mới" })).toHaveTextContent(
        "Bạn chưa có lớp nào. Hãy tạo lớp trước khi thêm buổi học.",
      ),
    );
    const form = screen.getByRole("dialog", { name: "Buổi học mới" });
    expect(within(form).getByRole("button", { name: "Thêm buổi học" })).toBeDisabled();
  });

  it("speaks English", async () => {
    await act(() => i18n.changeLanguage("en"));
    serveClasses();
    open();
    const form = await dialog("New session");
    for (const label of ["Class", "Date", "Starts", "Length", "Room"])
      expect(within(form).getByText(label, { exact: false })).toBeInTheDocument();
    expect(
      within(form).getByRole("switch", { name: "Repeat every week" }),
    ).toBeChecked();
    expect(form).toHaveTextContent("Until 19 Dec");
    expect(within(form).getByRole("textbox", { name: /Room/ })).toHaveAttribute(
      "placeholder",
      "Room 2",
    );
    expect(
      within(form).getByRole("button", { name: "Add session" }),
    ).toBeInTheDocument();
  });
});

describe("New session: what it sends and what it refuses", () => {
  it("sends a one-off with no room when Repeat is off and Room is cleared, and toasts", async () => {
    serveClasses();
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/teacher/classes/:id/sessions`, async ({ request }) => {
        body = await request.json();
        return contractJson(
          "/teacher/classes/{id}/sessions",
          "post",
          201,
          deckSession("2025-09-22", 2, 18, 2, "evening", {
            id: "019535d9-3df7-79fb-b466-fa907fa17f99",
            seriesId: null,
            series: null,
            room: null,
          }),
        );
      }),
    );
    const { onOpenChange } = open();
    const form = await dialog();
    const user = userEvent.setup();
    await user.click(within(form).getByRole("button", { name: "120 phút" }));
    await user.clear(within(form).getByRole("textbox", { name: /Phòng/ }));
    await user.click(within(form).getByRole("switch", { name: "Lặp lại mỗi tuần" }));
    await user.click(within(form).getByRole("button", { name: "Thêm buổi học" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(body).toEqual({
      date: TODAY,
      startTime: "18:00",
      durationMinutes: 120,
      room: null,
      repeatWeekly: false,
    });
    expect(
      await screen.findByText("Đã thêm buổi học · IELTS 6.5 Evening, 18:00"),
    ).toBeInTheDocument();
  });

  it("says an archived class takes no new session", async () => {
    serveClasses();
    server.use(
      http.post(`${BASE}/teacher/classes/:id/sessions`, () =>
        HttpResponse.json(
          { error: { code: "CLASS_ARCHIVED", message: "archived", requestId: "r" } },
          { status: 409 },
        ),
      ),
    );
    open();
    const form = await dialog();
    await userEvent
      .setup()
      .click(within(form).getByRole("button", { name: "Thêm buổi học" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Lớp này đã được lưu trữ nên không nhận buổi học mới.",
    );
  });
});

describe("New session: its rules", () => {
  it("refuses a date more than two years out, and takes one on the last day allowed", () => {
    const values = newSessionDefaults(CLASSES, TODAY);
    expect(validateNewSession({ ...values, date: "2027-09-25" }, TODAY, t)).toEqual({
      date: "Chọn một ngày trong vòng hai năm tới.",
    });
    expect(validateNewSession({ ...values, date: "2027-09-24" }, TODAY, t)).toBeNull();
    expect(validateNewSession(values, TODAY, t)).toBeNull();
  });

  it("opens empty when there is no class, and keeps the room a teacher typed", () => {
    expect(newSessionDefaults([], TODAY)).toMatchObject({ cls: "", room: "" });
    const follow = followClass(CLASSES);
    const start = newSessionDefaults(CLASSES, TODAY);
    expect(follow({ ...start, cls: CLASSES[2]!.id }, start).room).toBe("");
    const typed = { ...start, room: "Phòng 9" };
    expect(follow({ ...typed, cls: CLASSES[1]!.id }, typed).room).toBe("Phòng 9");
  });

  it("names the term's last day with its year when it ends in another year", () => {
    const values = newSessionDefaults(CLASSES, TODAY);
    const spring = { ...TERM, endsOn: "2026-01-16" };
    expect(repeatHint(values, [spring], t, "vi")).toBe("Đến hết 16 thg 1 năm 2026");
    expect(repeatHint(values, [spring], i18n.getFixedT("en") as TFunction, "en")).toBe(
      "Until 16 Jan 2026",
    );
    expect(repeatHint({ ...values, rep: false }, [spring], t, "vi")).toBeUndefined();
  });
});
