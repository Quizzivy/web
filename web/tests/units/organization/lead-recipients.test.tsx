import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { contractJson } from "@tests/support/contractResponse";
import { contentWidth } from "@tests/support/contentWidth";
import { useAuthStore } from "@/stores/auth";
import { SAVED, failure, servesImpact, servesSettings, signInAsAdmin } from "./support";
import { renderSettings } from "./render";
import "@/lib/i18n";

const LABEL = "Yêu cầu tư vấn mới gửi tới";
const HINT = "Họ nhận một email không có số điện thoại, kèm đường dẫn tới yêu cầu đó.";
const TOO_MANY = "Tối đa 5 địa chỉ email.";
const INVALID = "Email không hợp lệ.";
const FIVE = ["a", "b", "c", "d", "e"].map((name) => `${name}@quizzivy.com`);
const TOLD = { ...SAVED, leadRecipients: ["tuvan@quizzivy.com"] };

beforeEach(() => {
  contentWidth(1080);
  signInAsAdmin();
  servesImpact();
});

afterEach(() => {
  useAuthStore.getState().clearSession();
});

const field = () => screen.findByRole("textbox", { name: LABEL });
const box = async () => (await field()).closest<HTMLElement>('[data-slot="chip-box"]')!;
const chips = async () =>
  [...(await box()).querySelectorAll('[data-slot="chip"]')].map(
    (chip) => chip.textContent,
  );
const save = () => screen.getByRole("button", { name: "Lưu thay đổi" });

describe("who is told of a new consultation request", () => {
  it("shows the saved addresses as chips in the Organization card, and says what they get", async () => {
    servesSettings(TOLD);
    renderSettings();

    expect(await chips()).toEqual(["tuvan@quizzivy.com"]);
    expect(await field()).toHaveAccessibleDescription(HINT);
    expect(
      within(screen.getByRole("region", { name: "Tổ chức" })).getByRole("textbox", {
        name: LABEL,
      }),
    ).toBe(await field());
  });

  it("adds an address on Enter, a comma or a space, lower-cased, and none twice", async () => {
    servesSettings();
    renderSettings();
    const user = userEvent.setup();

    await user.type(await field(), "Le.Tan@Quizzivy.com{Enter}");
    await user.type(await field(), "tuvan@quizzivy.com,");
    await user.type(await field(), "TUVAN@quizzivy.com ");

    expect(await chips()).toEqual(["le.tan@quizzivy.com", "tuvan@quizzivy.com"]);
    expect(screen.queryByText(INVALID)).toBeNull();
  });

  it("sends the addresses with the save, and an empty list when the last is removed", async () => {
    const stored = servesSettings(TOLD);
    renderSettings();
    const user = userEvent.setup();

    await user.type(await field(), "letan@quizzivy.com{Enter}");
    await user.click(save());
    await waitFor(() => expect(stored.puts).toHaveLength(1));
    expect(stored.puts[0]?.leadRecipients).toEqual([
      "tuvan@quizzivy.com",
      "letan@quizzivy.com",
    ]);

    await user.click(screen.getByRole("button", { name: "Bỏ tuvan@quizzivy.com" }));
    await user.click(screen.getByRole("button", { name: "Bỏ letan@quizzivy.com" }));
    await user.click(save());
    await waitFor(() => expect(stored.puts).toHaveLength(2));
    expect(stored.puts[1]?.leadRecipients).toEqual([]);
  });

  it("takes five addresses and refuses a sixth on the field as soon as it is added, sending nothing until one is removed", async () => {
    const stored = servesSettings({ ...SAVED, leadRecipients: FIVE.slice(0, 4) });
    renderSettings();
    const user = userEvent.setup();

    await user.type(await field(), "e@quizzivy.com{Enter}");
    expect(await chips()).toEqual(FIVE);
    expect(screen.queryByText(TOO_MANY)).toBeNull();

    await user.type(await field(), "f@quizzivy.com{Enter}");
    expect(await screen.findByText(TOO_MANY)).toBeVisible();
    expect(await field()).toHaveAttribute("aria-invalid", "true");
    expect(await field()).toHaveAccessibleDescription(TOO_MANY);

    await user.click(save());
    expect(stored.puts).toHaveLength(0);
    expect(await field()).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Bỏ f@quizzivy.com" }));
    await waitFor(() => expect(screen.queryByText(TOO_MANY)).toBeNull());
    await user.click(save());
    await waitFor(() => expect(stored.puts).toHaveLength(1));
    expect(stored.puts[0]?.leadRecipients).toEqual(FIVE);
  });

  it("refuses an entry that is no email address as soon as it is added, and sends nothing", async () => {
    const stored = servesSettings();
    renderSettings();
    const user = userEvent.setup();

    await user.type(await field(), "le.tan.quizzivy.com{Enter}");

    expect(await screen.findByText(INVALID)).toBeVisible();
    expect(await field()).toHaveAttribute("aria-invalid", "true");
    await user.click(save());
    expect(stored.puts).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Bỏ le.tan.quizzivy.com" }));
    await waitFor(() => expect(screen.queryByText(INVALID)).toBeNull());
    expect(await field()).toHaveAccessibleDescription(HINT);
  });

  it("shows the server's refusal of one address on the field, opening Organization from another section", async () => {
    const refusalText = "Địa chỉ này không nhận được thư.";
    servesSettings(TOLD, () =>
      contractJson(
        "/admin/settings",
        "put",
        400,
        failure("VALIDATION_FAILED", "Cài đặt không hợp lệ.", {
          "leadRecipients.1": refusalText,
        }),
      ),
    );
    const { router } = renderSettings();
    const user = userEvent.setup();
    await user.type(await field(), "letan@quizzivy.com{Enter}");
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Mục cài đặt hệ thống" }),
      ).getByRole("link", { name: "Đăng nhập" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/settings/sign-in"),
    );

    await user.click(save());

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/settings/organization"),
    );
    await waitFor(() => expect(screen.getByText(refusalText)).toBeVisible());
    await waitFor(async () => expect(await field()).toHaveFocus());
    expect(await chips()).toEqual(["tuvan@quizzivy.com", "letan@quizzivy.com"]);
  });
});
