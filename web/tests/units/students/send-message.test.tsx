import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { useAuthStore } from "@/stores/auth";
import { teacherUser } from "@tests/support/fixtures";
import {
  CLASS_A,
  inClass,
  menuOf,
  renderStudents,
  rowOf,
  serveStudents,
  student,
} from "./support";
import "@/lib/i18n";

const AN = student("018f0000-0000-7000-8000-0000000000e1", "Nguyễn Văn An", {
  classes: [inClass(CLASS_A)],
});
const CHI = student("018f0000-0000-7000-8000-0000000000e3", "Lê Minh Chi", {
  classes: [inClass(CLASS_A)],
});
// In the list without a class: assigned to one of the caller's tests, or
// created by them, which the row does not say.
const BINH = student("018f0000-0000-7000-8000-0000000000e2", "Trần Thị Bình");
// In one of the caller's classes, but suspended: the API refuses a thread
// with a student whose account is disabled.
const DUNG = student("018f0000-0000-7000-8000-0000000000e4", "Phạm Thu Dung", {
  classes: [inClass(CLASS_A)],
  disabledAt: "2026-10-01T00:00:00Z",
});

afterEach(() => {
  useAuthStore.getState().clearSession();
});

async function choose(
  user: ReturnType<typeof renderStudents>["user"],
  ...names: string[]
) {
  for (const name of names) {
    const row = await rowOf(name);
    await user.click(within(row).getByRole("checkbox", { name: `Chọn ${name}` }));
  }
}

describe("Send message on a student's row", () => {
  it("opens the caller's thread with a student the row places in a class", async () => {
    serveStudents([AN]);
    const { user, router } = renderStudents(teacherUser);

    const menu = await menuOf(user, "Nguyễn Văn An");
    const item = within(menu).getByRole("menuitem", { name: "Gửi tin nhắn" });
    expect(item).toHaveAttribute("href", `/teacher/messages/student/${AN.id}`);
    await user.click(item);
    expect(router.state.location.pathname).toBe(`/teacher/messages/student/${AN.id}`);
  });

  it("is not offered for a student the row places in no class", async () => {
    serveStudents([BINH]);
    const { user } = renderStudents(teacherUser);

    const menu = await menuOf(user, "Trần Thị Bình");
    expect(within(menu).queryByRole("menuitem", { name: "Gửi tin nhắn" })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Xem kết quả" })).toBeVisible();
  });

  it("is not offered for a suspended student, though the row places them in a class", async () => {
    serveStudents([DUNG]);
    const { user } = renderStudents(teacherUser);

    const menu = await menuOf(user, "Phạm Thu Dung");
    expect(within(menu).queryByRole("menuitem", { name: "Gửi tin nhắn" })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Xem kết quả" })).toBeVisible();
  });

  it("is not offered to a role that does not open the teacher workspace", async () => {
    serveStudents([AN]);
    const { user } = renderStudents({ ...teacherUser, workspaces: ["admin"] });

    const menu = await menuOf(user, "Nguyễn Văn An");
    expect(within(menu).queryByRole("menuitem", { name: "Gửi tin nhắn" })).toBeNull();
  });
});

describe("the bulk bar's Message", () => {
  it("comes first in the bar, as the deck draws it", async () => {
    serveStudents([AN]);
    const { user } = renderStudents(teacherUser);
    await choose(user, "Nguyễn Văn An");

    const bar = screen.getByText(/Đã chọn 1/).parentElement!;
    expect(within(bar).getAllByRole("button")[0]).toHaveTextContent("Nhắn tin");
  });

  it("opens the one selected student's thread", async () => {
    serveStudents([AN, CHI]);
    const { user, router } = renderStudents(teacherUser);
    await choose(user, "Nguyễn Văn An");

    await user.click(screen.getByRole("button", { name: "Nhắn tin" }));
    expect(router.state.location.pathname).toBe(`/teacher/messages/student/${AN.id}`);
  });

  it("opens Messages on its Direct tab for more than one", async () => {
    serveStudents([AN, CHI]);
    const { user, router } = renderStudents(teacherUser);
    await choose(user, "Nguyễn Văn An", "Lê Minh Chi");

    await user.click(screen.getByRole("button", { name: "Nhắn tin" }));
    expect(router.state.location.pathname).toBe("/teacher/messages");
    expect(router.state.location.state).toEqual({ tab: "direct" });
  });

  it("opens the Direct tab, not a thread, for one student the row places in no class", async () => {
    serveStudents([BINH]);
    const { user, router } = renderStudents(teacherUser);
    await choose(user, "Trần Thị Bình");

    await user.click(screen.getByRole("button", { name: "Nhắn tin" }));
    expect(router.state.location.pathname).toBe("/teacher/messages");
    expect(router.state.location.state).toEqual({ tab: "direct" });
  });

  it("opens the Direct tab, not a thread, for one suspended student", async () => {
    serveStudents([DUNG]);
    const { user, router } = renderStudents(teacherUser);
    await choose(user, "Phạm Thu Dung");

    await user.click(screen.getByRole("button", { name: "Nhắn tin" }));
    expect(router.state.location.pathname).toBe("/teacher/messages");
    expect(router.state.location.state).toEqual({ tab: "direct" });
  });
});
