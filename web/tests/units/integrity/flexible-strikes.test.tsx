import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { StrikeDialog } from "@/features/integrity/components/StrikeDialog";
import { StrikeIndicator } from "@/features/integrity/components/StrikeIndicator";
import { strikeState } from "@/features/integrity/strikes";
import { useIntegrityAutoSubmit } from "@/features/integrity/useIntegrityAutoSubmit";
import { submitAttempt, type IntegrityPolicy } from "@/features/take-test/api";
import { useTakeTestStore } from "@/features/take-test/store";
import i18n from "@/lib/i18n";
import { session } from "../take-test/support";

vi.mock("@/features/take-test/api", () => ({
  submitAttempt: vi.fn(),
  saveAnswers: vi.fn(),
  getAttempt: vi.fn(),
}));

const policy: IntegrityPolicy = {
  requireFullscreen: false,
  blockCopyPaste: true,
  maxFocusLoss: 1,
  onLimitExceeded: "auto_submit",
  minAwayMs: 3000,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-01T08:00:00Z"));
  useTakeTestStore.getState().reset();
  vi.mocked(submitAttempt).mockReset();
});

afterEach(async () => {
  useTakeTestStore.getState().reset();
  await act(() => i18n.changeLanguage("vi"));
  vi.useRealTimers();
});

describe("strikeState under flexible", () => {
  it("has no limit, no allowance and nothing exceeded, whatever the stored policy", () => {
    expect(strikeState(policy, 5, "flexible")).toEqual({
      count: 5,
      limit: null,
      remaining: null,
      exceeded: false,
      consequence: "auto_submit",
      flexible: true,
    });
  });

  it("is as today under strict", () => {
    expect(strikeState(policy, 2)).toMatchObject({
      limit: 1,
      exceeded: true,
      flexible: false,
    });
    expect(strikeState(policy, 2, "strict")).toEqual(strikeState(policy, 2));
  });
});

describe("the strike dialog and the header's line under flexible", () => {
  it("says the absence is recorded and the teacher told, and points to the break", () => {
    render(<StrikeDialog state={strikeState(policy, 3, "flexible")} strikes={1} />);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Lần rời trang này đã được ghi lại, và giáo viên sẽ được báo. Câu trả lời của bạn vẫn an toàn. Nếu cần nghỉ, hãy bấm nút × Tạm nghỉ ở góc trên bên trái: bài được lưu để bạn làm tiếp sau.",
    );
  });

  it("never names an allowance, a count or a submit", () => {
    render(<StrikeDialog state={strikeState(policy, 9, "flexible")} strikes={9} />);
    const said = screen.getByRole("alertdialog").textContent ?? "";
    expect(said).not.toMatch(/được phép|lần \d|nộp|gian lận|vi phạm/);
  });

  it("says it in English", async () => {
    await act(() => i18n.changeLanguage("en"));
    render(<StrikeDialog state={strikeState(policy, 1, "flexible")} strikes={1} />);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "This time away is recorded, and your teacher is told. Your answers are safe. If you need a break, press × Take a break at the top left: your test is saved for later.",
    );
  });

  it("says the teacher has been told once an absence is counted, and nothing before", () => {
    const { container, rerender } = render(
      <StrikeIndicator state={strikeState(policy, 0, "flexible")} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<StrikeIndicator state={strikeState(policy, 1, "flexible")} />);
    expect(screen.getByText("Giáo viên đã được báo")).toHaveClass(
      "text-warning-ink",
      "font-medium",
    );
  });
});

describe("useIntegrityAutoSubmit under flexible", () => {
  function start(mode: "strict" | "flexible") {
    const payload = session({
      serverTime: "2026-09-01T08:00:00Z",
      deadlineAt: "2026-09-03T09:00:00Z",
    });
    useTakeTestStore
      .getState()
      .hydrate({ ...payload, mode, integrity: { ...payload.integrity, ...policy } });
  }

  it("never fires, even past a stored auto-submit limit", async () => {
    start("flexible");
    const view = renderHook(({ count }) => useIntegrityAutoSubmit(count), {
      initialProps: { count: 1 },
    });
    view.rerender({ count: 7 });
    await act(async () => {});
    expect(view.result.current).toBe(false);
    expect(submitAttempt).not.toHaveBeenCalled();
  });

  it("does not take up a stored auto-submit reason either", async () => {
    start("flexible");
    useTakeTestStore.setState({ submitReason: "auto_submit" });
    const view = renderHook(() => useIntegrityAutoSubmit(3));
    await act(async () => {});
    expect(view.result.current).toBe(false);
    expect(submitAttempt).not.toHaveBeenCalled();
  });

  it("still fires under strict past the limit", () => {
    start("strict");
    const view = renderHook(() => useIntegrityAutoSubmit(2));
    expect(view.result.current).toBe(true);
  });
});
