import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadInput, LeadOutcome } from "@/features/landing/api";
import { ConsultationForm } from "@/features/landing/components/Consultation";
import { CENTRE, landingBuild, readIn, renderLanding } from "@tests/support/landing";

beforeEach(async () => {
  landingBuild();
  await readIn("vi");
});
afterEach(() => vi.unstubAllEnvs());

function setup(outcome: LeadOutcome | Promise<LeadOutcome> = { kind: "sent" }) {
  const send = vi.fn<(input: LeadInput) => Promise<LeadOutcome>>(() =>
    Promise.resolve(outcome),
  );
  renderLanding(<ConsultationForm send={send} />);
  return {
    send,
    name: screen.getByRole("textbox", { name: "Họ và tên" }),
    phone: screen.getByRole("textbox", { name: "Số điện thoại" }),
    consent: screen.getByRole("checkbox"),
    submit: () =>
      userEvent.click(screen.getByRole("button", { name: /Gửi yêu cầu|Đang gửi/ })),
  };
}

describe("the consultation form", () => {
  // Fails when the form speaks before the first try, or names two mistakes, or changes their order.
  it("names one mistake at a time after the first try: the name, the phone, the box", async () => {
    const form = setup();
    expect(screen.queryByRole("alert")).toBeNull();

    await form.submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Vui lòng nhập họ tên.");
    expect(form.name).toHaveAttribute("aria-invalid", "true");

    await userEvent.type(form.name, "Trần Thu Hà");
    expect(screen.getByRole("alert")).toHaveTextContent("Số điện thoại chưa đúng.");
    expect(form.name).toHaveAttribute("aria-invalid", "false");

    await userEvent.type(form.phone, "0903 123 456");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Vui lòng đồng ý để chúng tôi liên hệ trước khi gửi.",
    );
    expect(form.consent).toHaveAttribute("aria-invalid", "true");
    expect(form.send).not.toHaveBeenCalled();
  });

  // Fails when a phone with fewer than nine digits is let through.
  it("refuses a phone number of eight digits", async () => {
    const form = setup();
    await userEvent.type(form.name, "Hà");
    await userEvent.type(form.phone, "0903 1234");
    await userEvent.click(form.consent);
    await form.submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Số điện thoại chưa đúng.");
    expect(form.send).not.toHaveBeenCalled();
  });

  // Fails when the request stops carrying the consent, the notice's version, the page's language or a trimmed name.
  it("sends what was filled in, with the consent and the notice's version", async () => {
    const form = setup();
    await userEvent.type(form.name, "  Trần Thu Hà ");
    await userEvent.type(form.phone, "0903 123 456");
    await userEvent.click(screen.getByRole("button", { name: "IELTS" }));
    await userEvent.click(screen.getByRole("button", { name: "Giao tiếp" }));
    await userEvent.click(screen.getByRole("radio", { name: "Con tôi" }));
    await userEvent.selectOptions(screen.getByRole("combobox"), "evening");
    await userEvent.click(form.consent);
    await form.submit();

    expect(form.send).toHaveBeenCalledExactlyOnceWith({
      fullName: "Trần Thu Hà",
      phone: "0903 123 456",
      interests: ["ielts", "communication"],
      courseFor: "child",
      callTime: "evening",
      locale: "vi",
      consent: true,
      privacyNoticeVersion: "2026-11",
    });
  });

  // Fails when the thanks stops naming the person, or "send another" keeps what was typed.
  it("thanks the person by name, and starts again empty", async () => {
    const form = setup();
    await userEvent.type(form.name, "Trần Thu Hà");
    await userEvent.type(form.phone, "0903123456");
    await userEvent.click(form.consent);
    await form.submit();

    expect(screen.getByRole("status")).toHaveTextContent("Cảm ơn, chúng tôi đã nhận");
    expect(
      screen.getByText(
        "Tư vấn viên sẽ gọi cho Trần Thu Hà trong vòng 1 ngày làm việc.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu khác" }));
    expect(screen.getByRole("textbox", { name: "Họ và tên" })).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Fails when the button can be pressed twice while a request is out.
  it("rests and reads Đang gửi… until the answer comes", async () => {
    let answer!: (outcome: LeadOutcome) => void;
    const form = setup(new Promise<LeadOutcome>((resolve) => (answer = resolve)));
    await userEvent.type(form.name, "Hà");
    await userEvent.type(form.phone, "0903123456");
    await userEvent.click(form.consent);
    await form.submit();

    const button = screen.getByRole("button", { name: "Đang gửi…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(form.send).toHaveBeenCalledOnce();
    answer({ kind: "sent" });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  // Fails when a refusal clears the form, or stops saying how long to wait or whom to call.
  it.each([
    [
      { kind: "limited", minutes: 10 } as const,
      "Có quá nhiều yêu cầu từ kết nối này. Hãy thử lại sau 10 phút.",
    ],
    [
      { kind: "failed" } as const,
      `Chưa gửi được yêu cầu. Vui lòng thử lại, hoặc gọi ${CENTRE.phone}.`,
    ],
  ])("keeps what was typed when the request ends as %o", async (outcome, line) => {
    const form = setup(outcome);
    await userEvent.type(form.name, "Trần Thu Hà");
    await userEvent.type(form.phone, "0903123456");
    await userEvent.click(form.consent);
    await form.submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(line);
    expect(form.name).toHaveValue("Trần Thu Hà");
    expect(form.consent).toBeChecked();
  });

  // Fails when the trap for scripts becomes a field a person can reach, or stops being sent.
  it("keeps the field no person fills away from the keyboard and from assistive technology", () => {
    const form = setup();
    const trap = document.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap).toHaveAttribute("autocomplete", "off");
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(
      within(document.body).queryByRole("textbox", { name: /website/i }),
    ).toBeNull();
    expect(form.send).not.toHaveBeenCalled();
  });

  // Fails when the notice opens in this tab and loses what was typed.
  it("links the box to the privacy notice in a new tab", () => {
    setup();
    const link = screen.getByRole("link", { name: "thông báo về quyền riêng tư" });
    expect(link).toHaveAttribute("href", "/privacy");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
  });
});
