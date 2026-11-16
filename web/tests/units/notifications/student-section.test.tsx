import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "msw";
import { StudentNotificationsSection } from "@/features/notifications/components/StudentNotificationsSection";
import { useAuthStore } from "@/stores/auth";
import { contractJson } from "@tests/support/contractResponse";
import { notificationDefaults, studentUser } from "@tests/support/fixtures";
import { server } from "@tests/support/server";
import { BASE } from "./support";
import "@/lib/i18n";

let puts: unknown[] = [];

beforeEach(() => {
  puts = [];
  useAuthStore.getState().setSession("token-a", studentUser);
  server.use(
    http.get(`${BASE}/me/notification-preferences`, () =>
      contractJson("/me/notification-preferences", "get", 200, notificationDefaults),
    ),
    http.put(`${BASE}/me/notification-preferences`, async ({ request }) => {
      const body = (await request.json()) as unknown[];
      puts.push(body);
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
      <StudentNotificationsSection />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("the student's Notifications (T-R7.23)", () => {
  it("draws the deck's three rows in order, Messages from teachers last and on", async () => {
    renderSection();
    const section = screen.getByRole("region", { name: "Thông báo" });

    const switches = await within(section).findAllByRole("switch");
    expect(switches).toHaveLength(3);
    expect(
      switches.map((control) => [
        control.getAttribute("aria-labelledby") &&
          document.getElementById(control.getAttribute("aria-labelledby")!)!
            .textContent,
        control.getAttribute("aria-checked"),
      ]),
    ).toEqual([
      ["Bài sắp hết hạn", "true"],
      ["Đã có kết quả", "true"],
      ["Tin nhắn từ giáo viên", "true"],
    ]);
    expect(
      within(section).getByRole("switch", { name: "Tin nhắn từ giáo viên" }),
    ).toHaveAccessibleDescription("Thông báo của lớp và tin nhắn riêng");
  });

  it("says under the card, with the student's address, that each switch also covers email", async () => {
    renderSection();
    const section = screen.getByRole("region", { name: "Thông báo" });
    await within(section).findAllByRole("switch");

    const note = screen.getByText(
      "Mỗi mục đang bật cũng được gửi qua email đến hocvien@example.com.",
    );
    expect(section.contains(note)).toBe(false);
    expect(section).toHaveAccessibleDescription(note.textContent!);
  });

  it("sends both channels from the Messages from teachers switch, and every other row as read", async () => {
    const user = renderSection();
    await user.click(
      await screen.findByRole("switch", { name: "Tin nhắn từ giáo viên" }),
    );

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual(
      notificationDefaults.map((row) =>
        row.event === "message.received" ? { ...row, inApp: false, email: false } : row,
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Tin nhắn từ giáo viên" }),
      ).not.toBeChecked(),
    );
  });

  it("turns a switch back on in both channels", async () => {
    server.use(
      http.get(`${BASE}/me/notification-preferences`, () =>
        contractJson(
          "/me/notification-preferences",
          "get",
          200,
          notificationDefaults.map((row) =>
            row.event === "result.ready" ? { ...row, inApp: false, email: false } : row,
          ),
        ),
      ),
    );
    const user = renderSection();
    await user.click(await screen.findByRole("switch", { name: "Đã có kết quả" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toContainEqual({ event: "result.ready", inApp: true, email: true });
  });
});
