import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { Toaster, toast } from "@/components/ui/sonner";
import { NotificationsSection } from "@/features/settings/sections/Notifications";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { notificationDefaults, teacherUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import { BASE, REQUEST_ID, signIn } from "./support";
import "@/lib/i18n";

const STORED = [
  { event: "attempt.submitted", inApp: true, email: false },
  { event: "attempt.flagged", inApp: true, email: true },
  { event: "assignment.closing", inApp: false, email: false },
  { event: "assignment.due_soon", inApp: false, email: false },
  { event: "result.ready", inApp: true, email: false },
  { event: "message.received", inApp: true, email: false },
  { event: "summary.weekly", inApp: false, email: true },
] as const;

let saved: unknown[] = [];

beforeEach(() => {
  saved = [];
  signIn(teacherUser);
  server.use(
    http.get(`${BASE}/me/notification-preferences`, () =>
      contractJson("/me/notification-preferences", "get", 200, [...STORED]),
    ),
    http.put(`${BASE}/me/notification-preferences`, async ({ request }) => {
      const body = (await request.json()) as unknown[];
      saved.push(body);
      return contractJson("/me/notification-preferences", "put", 200, body);
    }),
  );
});

afterEach(() => {
  useAuthStore.getState().clearSession();
});

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationsSection />
      <Toaster />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const toggle = (update: string) =>
  screen.getByRole("switch", { name: `${update} trong ứng dụng` });
const byEmail = (update: string) =>
  screen.getByRole("switch", { name: `${update} qua email` });

/** The deck's rows, in its order, with their hints. */
const ROWS = [
  ["Học viên nộp bài", "Gộp lại mỗi 15 phút"],
  ["Một lượt làm bài bị gắn cờ", "Rời khỏi bài quá số lần cho phép"],
  ["Tin nhắn mới", "Tin nhắn riêng từ học viên và đồng nghiệp"],
  ["Bài giao sắp đóng", "Trước 1 giờ, kèm những ai chưa nộp"],
  ["Tổng kết tuần", "Sáng thứ Hai, theo từng lớp"],
] as const;

describe("the Notifications card", () => {
  it("draws the deck's grid: Update, In app and Email, and its five rows in order", async () => {
    renderSection();

    expect(screen.getByRole("heading", { name: "Thông báo" })).toBeVisible();
    expect(screen.getByText("Chọn nơi mỗi cập nhật đến với bạn.")).toBeVisible();
    expect(await screen.findByText("Gộp lại mỗi 15 phút")).toBeVisible();
    const head = screen.getByText("Cập nhật").parentElement!;
    expect([...head.children].map((cell) => cell.textContent)).toEqual([
      "Cập nhật",
      "Trong ứng dụng",
      "Email",
    ]);
    expect(
      screen
        .getAllByRole("switch")
        .map((control) => control.getAttribute("aria-label")),
    ).toEqual(
      ROWS.flatMap(([update]) => [`${update} trong ứng dụng`, `${update} qua email`]),
    );
    for (const [update, hint] of ROWS) {
      expect(toggle(update)).toHaveAccessibleDescription(hint);
      expect(byEmail(update)).toHaveAccessibleDescription(hint);
    }
  });

  it("shows each switch as stored", async () => {
    renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");

    expect(toggle("Học viên nộp bài")).toBeChecked();
    expect(byEmail("Học viên nộp bài")).not.toBeChecked();
    expect(byEmail("Một lượt làm bài bị gắn cờ")).toBeChecked();
    expect(toggle("Bài giao sắp đóng")).not.toBeChecked();
    expect(toggle("Tổng kết tuần")).not.toBeChecked();
    expect(byEmail("Tổng kết tuần")).toBeChecked();
  });

  it("renders the server's defaults as the deck's table has them (T-R7.13)", async () => {
    server.use(
      http.get(`${BASE}/me/notification-preferences`, () =>
        contractJson("/me/notification-preferences", "get", 200, notificationDefaults),
      ),
    );
    renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");

    expect(
      ROWS.map(([update]) => [
        update,
        (toggle(update) as HTMLButtonElement).getAttribute("aria-checked"),
        (byEmail(update) as HTMLButtonElement).getAttribute("aria-checked"),
      ]),
    ).toEqual([
      ["Học viên nộp bài", "true", "false"],
      ["Một lượt làm bài bị gắn cờ", "true", "true"],
      ["Tin nhắn mới", "true", "true"],
      ["Bài giao sắp đóng", "true", "false"],
      ["Tổng kết tuần", "false", "true"],
    ]);
  });

  it("saves an Email switch, and an In app one of another row, with every other row as read", async () => {
    const user = renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");

    await user.click(byEmail("Học viên nộp bài"));
    await user.click(toggle("Tin nhắn mới"));
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() =>
      expect(saved).toEqual([
        [
          { event: "attempt.submitted", inApp: true, email: true },
          { event: "attempt.flagged", inApp: true, email: true },
          { event: "assignment.closing", inApp: false, email: false },
          { event: "assignment.due_soon", inApp: false, email: false },
          { event: "result.ready", inApp: true, email: false },
          { event: "message.received", inApp: false, email: false },
          { event: "summary.weekly", inApp: false, email: true },
        ],
      ]),
    );
    expect(await screen.findByText("Đã lưu cài đặt")).toBeInTheDocument();
    expect(byEmail("Học viên nộp bài")).toBeChecked();
    expect(toggle("Học viên nộp bài")).toBeChecked();
    // Sonner keeps its toasts between renders: clear this one for the next test.
    act(() => {
      toast.dismiss();
    });
    await waitFor(() => expect(screen.queryByText("Đã lưu cài đặt")).toBeNull());
  });

  it("returns focus to the Email switch last changed after Discard", async () => {
    const user = renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");

    await user.click(byEmail("Tổng kết tuần"));
    await user.click(screen.getByRole("button", { name: "Bỏ thay đổi" }));

    expect(byEmail("Tổng kết tuần")).toBeChecked();
    expect(byEmail("Tổng kết tuần")).toHaveFocus();
  });

  it("saves a switch turned off with the other six rows as they were read", async () => {
    const user = renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");

    await user.click(toggle("Một lượt làm bài bị gắn cờ"));
    expect(screen.getByText("Bạn có thay đổi chưa lưu.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() =>
      expect(saved).toEqual([
        [
          { event: "attempt.submitted", inApp: true, email: false },
          { event: "attempt.flagged", inApp: false, email: true },
          { event: "assignment.closing", inApp: false, email: false },
          { event: "assignment.due_soon", inApp: false, email: false },
          { event: "result.ready", inApp: true, email: false },
          { event: "message.received", inApp: true, email: false },
          { event: "summary.weekly", inApp: false, email: true },
        ],
      ]),
    );
    expect(await screen.findByText("Đã lưu cài đặt")).toBeInTheDocument();
    expect(screen.queryByText("Bạn có thay đổi chưa lưu.")).toBeNull();
    expect(toggle("Một lượt làm bài bị gắn cờ")).not.toBeChecked();
  });

  it("restores the saved switches on Discard, and a switch put back is not a change", async () => {
    const user = renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");

    await user.click(toggle("Bài giao sắp đóng"));
    await user.click(toggle("Bài giao sắp đóng"));
    expect(screen.queryByText("Bạn có thay đổi chưa lưu.")).toBeNull();
    await user.click(toggle("Học viên nộp bài"));
    await user.click(screen.getByRole("button", { name: "Bỏ thay đổi" }));

    expect(toggle("Học viên nộp bài")).toBeChecked();
    expect(saved).toEqual([]);
  });

  it("keeps the change and shows the refusal in the bar", async () => {
    server.use(
      http.put(`${BASE}/me/notification-preferences`, () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_FAILED",
              message: "Cài đặt không hợp lệ.",
              requestId: REQUEST_ID,
            },
          },
          { status: 400 },
        ),
      ),
    );
    const user = renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");
    await user.click(toggle("Học viên nộp bài"));
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cài đặt không hợp lệ.");
    expect(toggle("Học viên nộp bài")).not.toBeChecked();
  });

  it("says the settings could not be read, and retries", async () => {
    let fail = true;
    server.use(
      http.get(`${BASE}/me/notification-preferences`, () =>
        fail
          ? HttpResponse.json(
              { error: { code: "INTERNAL", message: "Lỗi.", requestId: REQUEST_ID } },
              { status: 500 },
            )
          : contractJson("/me/notification-preferences", "get", 200, [...STORED]),
      ),
    );
    const user = renderSection();

    const failed = await screen.findByText("Không tải được cài đặt thông báo.");
    fail = false;
    await user.click(
      within(failed.parentElement!).getByRole("button", { name: "Thử lại" }),
    );
    expect(await screen.findByText("Gộp lại mỗi 15 phút")).toBeVisible();
  });

  it("keeps a switch focusable and inert while saving, then returns focus to it (T-35)", async () => {
    let open: () => void = () => undefined;
    const reply = new Promise<void>((resolve) => {
      open = resolve;
    });
    server.use(
      http.put(`${BASE}/me/notification-preferences`, async ({ request }) => {
        const body = (await request.json()) as unknown[];
        await reply;
        return contractJson("/me/notification-preferences", "put", 200, body);
      }),
    );
    const user = renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");
    const flagged = toggle("Một lượt làm bài bị gắn cờ");

    await user.click(flagged);
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(flagged).toHaveAttribute("aria-disabled", "true");
    expect(flagged).not.toBeDisabled();
    await user.click(flagged);
    expect(flagged).not.toBeChecked();
    open();

    expect(await screen.findByText("Đã lưu cài đặt")).toBeInTheDocument();
    await waitFor(() => expect(flagged).toHaveFocus());
  });

  it("returns focus to the switch last changed after Discard", async () => {
    const user = renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");

    await user.click(toggle("Bài giao sắp đóng"));
    await user.click(screen.getByRole("button", { name: "Bỏ thay đổi" }));

    expect(toggle("Bài giao sắp đóng")).not.toBeChecked();
    expect(toggle("Bài giao sắp đóng")).toHaveFocus();
  });

  it("describes each switch by its row's hint", async () => {
    renderSection();
    await screen.findByText("Gộp lại mỗi 15 phút");

    expect(toggle("Học viên nộp bài")).toHaveAccessibleDescription(
      "Gộp lại mỗi 15 phút",
    );
  });

  it("keeps the switches, without the load error, when a later read fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotificationsSection />
      </QueryClientProvider>,
    );
    await screen.findByText("Gộp lại mỗi 15 phút");
    server.use(
      http.get(`${BASE}/me/notification-preferences`, () =>
        HttpResponse.json(
          { error: { code: "INTERNAL", message: "Lỗi.", requestId: REQUEST_ID } },
          { status: 500 },
        ),
      ),
    );

    await act(() => client.refetchQueries());

    expect(toggle("Học viên nộp bài")).toBeChecked();
    expect(screen.queryByText("Không tải được cài đặt thông báo.")).toBeNull();
  });
});
