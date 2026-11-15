import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinBox } from "@/features/landing/components/Hero";
import {
  landingBuild,
  readIn,
  renderLanding,
  STUDENT_HOST,
} from "@tests/support/landing";

beforeEach(async () => {
  landingBuild();
  await readIn("vi");
});
afterEach(() => vi.unstubAllEnvs());

function setup() {
  const open = vi.fn();
  renderLanding(<JoinBox open={open} />);
  return {
    open,
    field: screen.getByRole("textbox", { name: "Mã lớp" }),
    button: screen.getByRole("button", { name: "Tham gia lớp" }),
  };
}

describe("the Landing's join box", () => {
  // Fails when the box stops using the app's own code rules (features/join/code).
  it("groups what is typed in fours, in capitals, and stops at eight", async () => {
    const { field } = setup();
    await userEvent.type(field, "k7qm 2pxa99");
    expect(field).toHaveValue("K7QM-2PXA");
  });

  // Fails when a whole code opens a path on this host, where it is a 404.
  it("opens the class on the student site, by its full address", async () => {
    const { open, field, button } = setup();
    await userEvent.type(field, "k7qm2pxa");
    await userEvent.click(button);
    expect(open).toHaveBeenCalledExactlyOnceWith(`${STUDENT_HOST}/join/K7QM-2PXA`);
  });

  // Fails when a short code leaves the page, or when the box speaks before a try.
  it("says to enter all eight characters only once a short code is sent", async () => {
    const { open, field } = setup();
    await userEvent.type(field, "k7qm2");
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.type(field, "{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập đủ 8 ký tự.");
    expect(open).not.toHaveBeenCalled();
    await userEvent.type(field, "p");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Fails when a character no code has is dropped silently or sent on.
  it("says at once that no code has a 0, O, 1 or I, and does not open it", async () => {
    const { open, field } = setup();
    await userEvent.type(field, "k7q02pxa{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mã lớp không bao giờ có 0, O, 1 hoặc I.",
    );
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(open).not.toHaveBeenCalled();
  });
});
