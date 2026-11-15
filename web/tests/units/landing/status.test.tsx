import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicStatus } from "@/features/landing/api";
import StatusPage from "@/features/landing/pages/StatusPage";
import { CENTRE, landingBuild, readIn, renderLanding } from "@tests/support/landing";

beforeEach(async () => {
  landingBuild();
  await readIn("vi");
});
afterEach(() => vi.unstubAllEnvs());

const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const NORMAL: PublicStatus = { maintenance: null, ai: false };
const window = (active: boolean): PublicStatus => ({
  maintenance: {
    startsAt: soon(active ? -10 : 60),
    endsAt: soon(active ? 50 : 120),
    active,
  },
  ai: false,
});

function setup(read: () => Promise<PublicStatus>) {
  const ask = vi.fn(read);
  renderLanding(<StatusPage read={ask} />);
  return ask;
}

describe("the status page", () => {
  // Fails when an answer with no window stops reading as all normal, or the page loses its way home or the phone.
  it("says all is normal when no update is planned", async () => {
    setup(() => Promise.resolve(NORMAL));
    expect(
      await screen.findByRole("heading", {
        name: "Mọi thứ đang hoạt động bình thường",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hoạt động bình thường")).toBeInTheDocument();
    expect(screen.getByText(/^kiểm tra lúc \d\d:\d\d$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByText(`Cần giúp ngay? Gọi ${CENTRE.phone}.`)).toBeInTheDocument();
  });

  // Fails when a window that has not started is shown as the update itself.
  it("says an update is planned, from when to when, and that all works for now", async () => {
    setup(() => Promise.resolve(window(false)));
    expect(
      await screen.findByRole("heading", { name: "Quizzivy sắp được cập nhật" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^Từ .+ đến .+\. Bài kiểm tra đóng trong lúc cập nhật sẽ được gia hạn\.$/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("khoảng 60 phút")).toBeInTheDocument();
    expect(screen.getByText("Bây giờ mọi thứ vẫn hoạt động")).toBeInTheDocument();
  });

  // Fails when the update under way stops being the app's own maintenance page, or loses the way home added to it.
  it("shows the app's maintenance page during an update, with a way home", async () => {
    setup(() => Promise.resolve(window(true)));
    expect(
      await screen.findByRole("heading", { name: "Quizzivy đang được cập nhật" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bài làm và kết quả đã được lưu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByText(/Cần giúp ngay/)).toBeNull();
  });

  // Fails when no answer is shown as normal, or when the page asks again by itself.
  it("says it could not check, and asks again only when told to", async () => {
    let fail = true;
    const ask = setup(() =>
      fail ? Promise.reject(new Error("offline")) : Promise.resolve(NORMAL),
    );
    expect(
      await screen.findByRole("heading", { name: "Chưa kiểm tra được trạng thái" }),
    ).toBeInTheDocument();
    expect(ask).toHaveBeenCalledOnce();

    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Kiểm tra lại" }));
    expect(
      await screen.findByRole("heading", {
        name: "Mọi thứ đang hoạt động bình thường",
      }),
    ).toBeInTheDocument();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  // Fails when the button can start a second check while one is out.
  it("rests the button while the answer is on its way", () => {
    setup(() => new Promise<PublicStatus>(() => undefined));
    expect(screen.getByRole("heading", { name: "Đang kiểm tra…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kiểm tra lại" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  // Fails when the last line prints an empty phone.
  it("leaves the phone line out when the build sets no phone", async () => {
    landingBuild(["phone"]);
    setup(() => Promise.resolve(NORMAL));
    await screen.findByRole("heading", { name: "Mọi thứ đang hoạt động bình thường" });
    expect(screen.queryByText(/Cần giúp ngay/)).toBeNull();
  });
});
