import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import LoginPage from "@/features/auth/pages/LoginPage";
import { server } from "@tests/support/server";
import { contractJson } from "@tests/support/contractResponse";
import { saveJoinContext } from "@/features/join/context";
import { teacherUser } from "@tests/support/fixtures";
import { useAuthStore } from "@/stores/auth";
import { asHost } from "@tests/support/host";
import "@/lib/i18n";

const BASE = "http://localhost:8080";

function renderLogin(initialEntry = "/login") {
  const routes: RouteObject[] = [
    { path: "/login", element: <LoginPage /> },
    { path: "/admin", element: <p>admin console</p> },
    { path: "/teacher", element: <p>admin home</p> },
    { path: "/", element: <p>student home</p> },
    { path: "/join/:code", element: <p>join page</p> },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  useAuthStore.getState().clearSession();
  sessionStorage.clear();
  vi.unstubAllEnvs();
});

function wrongHost(message: string) {
  server.use(
    http.post(`${BASE}/auth/login`, () =>
      contractJson("/auth/login", "post", 403, {
        error: {
          code: "FORBIDDEN",
          message,
          requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
        },
      }),
    ),
  );
}

async function signInWith(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "ai-do@example.com");
  await user.type(screen.getByLabelText("Mật khẩu"), "quizzivy-dev");
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
}

/**
 * An account that belongs at the other host (§5.8). Each case fails when the
 * sign-in page stops reading the refusal: the first two when the link to the
 * other host's sign-in is dropped or points at this host, the third when a
 * page that is the only host offers a link to nowhere.
 */
describe("/login for an account of the other host", () => {
  it.each([
    [
      "student",
      "Tài khoản này dành cho giáo viên và quản trị viên. Hãy đăng nhập tại portal.quizzivy.com.",
      "portal.quizzivy.com",
    ],
    [
      "staff",
      "Đây là tài khoản học viên. Hãy đăng nhập tại my.quizzivy.com.",
      "my.quizzivy.com",
    ],
  ] as const)(
    "at the %s host, says where the account signs in and links there",
    async (kind, message, host) => {
      asHost(kind);
      wrongHost(message);
      const user = userEvent.setup();
      const router = renderLogin();
      await signInWith(user);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(message);
      expect(
        screen.getByRole("link", { name: `Mở trang đăng nhập của ${host}` }),
      ).toHaveAttribute("href", `https://${host}/login`);
      expect(router.state.location.pathname).toBe("/login");
      expect(useAuthStore.getState().user).toBeNull();
    },
  );

  it("offers no other host where one host serves every page", async () => {
    asHost("all");
    wrongHost("Bạn không có quyền truy cập chức năng này.");
    const user = userEvent.setup();
    renderLogin();
    await signInWith(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bạn không có quyền truy cập chức năng này.",
    );
    expect(screen.queryByRole("link", { name: /Mở trang đăng nhập của/ })).toBeNull();
  });

  it("drops the link with the message when the form is sent again", async () => {
    asHost("student");
    wrongHost("Tài khoản này dành cho giáo viên và quản trị viên.");
    const user = userEvent.setup();
    renderLogin();
    await signInWith(user);
    expect(
      await screen.findByRole("link", { name: /Mở trang đăng nhập của/ }),
    ).toBeInTheDocument();

    server.use(
      http.post(`${BASE}/auth/login`, () =>
        contractJson("/auth/login", "post", 401, {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email hoặc mật khẩu không đúng.",
            requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
          },
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Mở trang đăng nhập của/ })).toBeNull(),
    );
  });
});

describe("/login", () => {
  it("does not submit an invalid email", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Mật khẩu"), "quizzivy-dev");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("says the credentials do not match in the product's words", async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        contractJson("/auth/login", "post", 401, {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email hoặc mật khẩu không đúng.",
            requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
          },
        }),
      ),
    );

    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "ai-do@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "sai-mat-khau");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Email và mật khẩu không khớp. Hãy kiểm tra lỗi gõ, hoặc nhờ giáo viên đặt lại mật khẩu.",
    );
  });

  it("shows any other server message as written, and clears it on the next edit", async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        contractJson("/auth/login", "post", 429, {
          error: {
            code: "RATE_LIMITED",
            message: "Bạn thử quá nhiều lần. Hãy chờ một phút.",
            requestId: "019535d9-3df7-79fb-b466-fa907fa17f9e",
          },
        }),
      ),
    );

    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "ai-do@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "mat-khau");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bạn thử quá nhiều lần. Hãy chờ một phút.",
    );
    await user.type(screen.getByLabelText("Mật khẩu"), "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks for both fields before sending anything", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Hãy nhập email và mật khẩu.",
    );
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("marks the button busy while signing in rather than disabling it", async () => {
    let release = () => {};
    server.use(
      http.post(
        `${BASE}/auth/login`,
        () =>
          new Promise<Response>((resolve) => {
            release = () => resolve(new Response(null, { status: 503 }));
          }),
      ),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "thuong@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "quizzivy-dev");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    const busy = await screen.findByRole("button", { name: "Đang đăng nhập…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeEnabled();
    release();
  });

  it("sends the Admin to the Admin console", async () => {
    // "/" would bounce off the index route straight back to /login.
    const user = userEvent.setup();
    const router = renderLogin();

    await user.type(screen.getByLabelText("Email"), "thuong@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "quizzivy-dev");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    // The default handler answers with adminUser.
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin"));
  });

  it("sends a teacher to the teacher's console", async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        contractJson("/auth/login", "post", 200, {
          accessToken: "test-access-token",
          expiresIn: 900,
          user: teacherUser,
        }),
      ),
    );
    const user = userEvent.setup();
    const router = renderLogin();

    await user.type(screen.getByLabelText("Email"), "thuong@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "quizzivy-dev");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/teacher"));
  });

  it("refuses an off-site ?next=", async () => {
    const user = userEvent.setup();
    const router = renderLogin("/login?next=https://evil.test/steal");

    await user.type(screen.getByLabelText("Email"), "thuong@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "quizzivy-dev");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/admin"));
    expect(router.state.location.pathname).not.toContain("evil.test");
  });

  it("walks from Google through the form in the order the deck draws it", async () => {
    const user = userEvent.setup();
    renderLogin();

    screen.getByRole("button", { name: "Tiếp tục với Google" }).focus();
    await user.tab();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Quên mật khẩu?" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Mật khẩu")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Hiện mật khẩu" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Tham gia lớp" })).toHaveFocus();
  });

  it("uses the autocomplete tokens password managers need", () => {
    renderLogin();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Mật khẩu")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  it("never renders the deck's prototype chrome", () => {
    renderLogin();
    expect(
      screen.queryByText(/demo accounts|tài khoản dùng thử|T6NB-4WLQ/i),
    ).toBeNull();
  });

  it("offers no way to create an account", () => {
    renderLogin();
    expect(screen.queryByRole("button", { name: /đăng ký|tạo tài khoản/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /đăng ký|tạo tài khoản/i })).toBeNull();
  });

  it("names the class a visitor came to join, and goes back to finish it", async () => {
    saveJoinContext({
      code: "K7QM2PXA",
      className: "TOEIC 600 Weekend",
      teacherName: "Hoàng Thương",
    });
    const user = userEvent.setup();
    const router = renderLogin();
    expect(screen.getByText("Đăng nhập để tham gia TOEIC 600 Weekend.")).toBeVisible();

    await user.type(screen.getByLabelText("Email"), "thuong@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "quizzivy-dev");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/join/K7QM2PXA"));
  });

  it("welcomes back a visitor who is not joining anything", () => {
    renderLogin();
    expect(screen.getByText("Chào mừng bạn trở lại.")).toBeVisible();
  });
});
