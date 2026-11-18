import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CloseEarlyDialog } from "@/features/assignments/components/CloseEarlyDialog";
import "@/lib/i18n";
import { assignment } from "../attempts/fixtures";

const NOW = new Date("2026-09-24T03:00:00.000Z");
const CLOSES_AT = "2026-09-26T15:00:00Z";

function open(mode: "strict" | "flexible") {
  render(
    <CloseEarlyDialog
      assignment={assignment({
        mode,
        durationMinutes: 45,
        window: {
          opensAt: "2026-09-20T01:00:00Z",
          closesAt: CLOSES_AT,
          closedAt: null,
        },
      })}
      open
      pending={false}
      failed={false}
      onOpenChange={() => {}}
      onConfirm={() => {}}
    />,
  );
  return screen.getByRole("dialog");
}

/**
 * Closing early never moves a deadline earlier. Under strict that means the
 * time limit; under flexible, which applies none, students mid-test carry on
 * until the planned close (77f Q6), and the note and the box to tick say so.
 */
describe("closing early under each mode", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("strict: promises students mid-test their minutes", () => {
    const dialog = open("strict");
    expect(
      within(dialog).getByText("Học viên đang làm vẫn được làm hết 45 phút của mình."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", {
        name: "Tôi hiểu học viên đang làm vẫn được làm hết giờ",
      }),
    ).toBeInTheDocument();
  });

  it("flexible: says students mid-test carry on until the planned close", () => {
    const dialog = open("flexible");
    expect(
      within(dialog).getByText(
        "Học viên đang làm vẫn được làm tiếp đến 22:00 · Thứ bảy, 26/09.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", {
        name: "Tôi hiểu học viên đang làm vẫn được làm tiếp đến hạn",
      }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/45 phút/)).not.toBeInTheDocument();
  });
});
