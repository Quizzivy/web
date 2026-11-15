import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LandingApp } from "@/features/landing/LandingApp";
import { navigate } from "@/features/landing/navigation";
import { links } from "@/features/landing/site";
import {
  landingBuild,
  openAt,
  readIn,
  renderLanding,
  STAFF_HOST,
  STUDENT_HOST,
} from "@tests/support/landing";

beforeEach(async () => {
  landingBuild();
  await readIn("vi");
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.unstubAllEnvs();
  openAt("/");
});

const HEADLINE = /Học tiếng Anh trên lớp,\s*làm bài\s*trên Quizzivy/;

describe("the landing site's pages", () => {
  // Fails when the site stops reading its page from the address, or loses one of its three pages.
  it.each([
    ["/", HEADLINE, "Quizzivy · Hệ thống kiểm tra tiếng Anh trực tuyến"],
    [
      "/privacy",
      "Thông báo về quyền riêng tư",
      "Thông báo về quyền riêng tư · Quizzivy",
    ],
    [
      "/privacy/",
      "Thông báo về quyền riêng tư",
      "Thông báo về quyền riêng tư · Quizzivy",
    ],
  ])("opens %s and names it in the tab", async (address, heading, title) => {
    openAt(address);
    renderLanding(<LandingApp />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(heading);
    expect(document.title).toBe(title);
  });

  // Fails when an address of the app is answered here with anything but the not-found page.
  it.each(["/login", "/join/K7QM-2PXA", "/teacher", "/admin/leads"])(
    "answers %s with the not-found page and a way to the first page",
    async (address) => {
      openAt(address);
      renderLanding(<LandingApp />);
      expect(
        await screen.findByRole("heading", { name: "Trang này không tồn tại" }),
      ).toBeInTheDocument();
      expect(screen.getByText(address)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("link", { name: "Về trang chủ" }));
      expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
        HEADLINE,
      );
      expect(window.location.pathname).toBe("/");
    },
  );

  // Fails when a link to another page of the site loads the document again, or the address stops following it.
  it("changes page in place on a link, and follows the address back", async () => {
    openAt("/");
    renderLanding(<LandingApp />);
    await userEvent.click(
      within(screen.getByRole("contentinfo")).getByRole("link", {
        name: "Quyền riêng tư",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Thông báo về quyền riêng tư",
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/privacy");

    act(() => navigate("/"));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      HEADLINE,
    );
  });

  // Fails when a link to a part of the Landing leaves the reader at the top.
  it("follows a link to a part of the Landing", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    openAt("/privacy");
    renderLanding(<LandingApp />);
    await screen.findByRole("heading", {
      level: 1,
      name: "Thông báo về quyền riêng tư",
    });
    await userEvent.click(
      within(screen.getByRole("navigation")).getByRole("link", { name: "Hỏi đáp" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Câu hỏi thường gặp" }),
    ).toBeInTheDocument();
    expect(`${window.location.pathname}${window.location.hash}`).toBe("/#faq");
    expect(scrolled).toHaveBeenCalled();
  });

  // Fails when a link into the app is written by path: the site has no page of the app.
  it("writes every link into the app with that host's full address", () => {
    expect(links.studentSignIn()).toBe(`${STUDENT_HOST}/login`);
    expect(links.staffSignIn()).toBe(`${STAFF_HOST}/login`);
    expect(links.join()).toBe(`${STUDENT_HOST}/join`);
    expect(links.joinCode("K7QM2PXA")).toBe(`${STUDENT_HOST}/join/K7QM-2PXA`);

    openAt("/");
    renderLanding(<LandingApp />);
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Học viên đăng nhập" })).toHaveAttribute(
      "href",
      `${STUDENT_HOST}/login`,
    );
    expect(footer.getByRole("link", { name: "Giáo viên đăng nhập" })).toHaveAttribute(
      "href",
      `${STAFF_HOST}/login`,
    );
    expect(footer.getByRole("link", { name: "Tham gia lớp" })).toHaveAttribute(
      "href",
      `${STUDENT_HOST}/join`,
    );
  });

  // Fails when the language switch stops loading the other language, or stops keeping the choice.
  it("switches to English and keeps the choice", async () => {
    openAt("/");
    renderLanding(<LandingApp />);
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /Learn English in class,\s*take your tests\s*on Quizzivy/,
    );
    expect(localStorage.getItem("quizzivy.locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
