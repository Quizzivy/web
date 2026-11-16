import { afterEach, describe, expect, it, vi as vitest } from "vitest";
import { en, vi } from "@tests/support/locales";

/**
 * T-R11.12a: only the Vietnamese `common` strings are bundled; each route
 * tree fetches its surface's file before it renders. The test setup loads
 * every surface on the shared instance, so each case starts from a fresh
 * module, whose `init` holds the bundled strings alone.
 */
const TEACHER = "builder.titleLabel";
const ADMIN = "adminShell.nav.users";
const STUDENT = "student.shell.test";

afterEach(() => {
  vitest.doUnmock("@/lib/i18n/locales/en/teacher.json");
  vitest.doUnmock("@/lib/i18n/locales/vi/student.json");
  vitest.resetModules();
  localStorage.clear();
  document.documentElement.lang = "vi";
});

async function start() {
  vitest.resetModules();
  return import("@/lib/i18n");
}

describe("a surface's strings", () => {
  it("are not loaded until a route tree asks for them, and then only that surface's", async () => {
    const { default: i18n, loadSurface } = await start();
    expect(i18n.exists("common.cancel")).toBe(true);
    expect(i18n.exists(TEACHER)).toBe(false);

    await loadSurface("teacher");

    expect(i18n.t(TEACHER)).toBe(vi.builder.titleLabel);
    expect(i18n.exists(ADMIN)).toBe(false);
    expect(i18n.exists(STUDENT)).toBe(false);
  });

  it("load in English too while English is on screen", async () => {
    const { default: i18n, loadSurface, setLocale } = await start();
    await setLocale("en");

    await loadSurface("teacher");

    expect(i18n.t(TEACHER)).toBe(en.builder.titleLabel);
    expect(i18n.t(TEACHER, { lng: "vi" })).toBe(vi.builder.titleLabel);
  });

  it("already loaded come along on a switch to English, before the screen changes", async () => {
    const { default: i18n, loadSurface, setLocale } = await start();
    await loadSurface("student");

    const switching = setLocale("en");
    expect(i18n.language).toBe("vi");
    await switching;

    expect(i18n.language).toBe("en");
    expect(i18n.t(STUDENT)).toBe(en.student.shell.test);
  });

  it("asked for while English loads arrive in English as well", async () => {
    const { default: i18n, loadSurface, setLocale } = await start();

    const switching = setLocale("en");
    await loadSurface("admin");
    await switching;

    expect(i18n.t(ADMIN)).toBe(en.adminShell.nav.users);
  });

  it("show in Vietnamese when their English file cannot be fetched, and are tried again on the next switch", async () => {
    vitest.doMock("@/lib/i18n/locales/en/teacher.json", () => {
      throw new Error("the English teacher chunk is unreachable");
    });
    const { default: i18n, loadSurface, setLocale } = await start();
    await setLocale("en");

    await loadSurface("teacher");

    expect(i18n.language).toBe("en");
    expect(i18n.t("common.cancel")).toBe(en.common.cancel);
    expect(i18n.t(TEACHER)).toBe(vi.builder.titleLabel);

    vitest.doUnmock("@/lib/i18n/locales/en/teacher.json");
    await setLocale("vi");
    await setLocale("en");
    expect(i18n.t(TEACHER)).toBe(en.builder.titleLabel);
  });

  it("fail their route when the Vietnamese file cannot be fetched", async () => {
    vitest.doMock("@/lib/i18n/locales/vi/student.json", () => {
      throw new Error("the student chunk is unreachable");
    });
    const { default: i18n, loadSurface } = await start();

    await expect(loadSurface("student")).rejects.toThrow();
    expect(i18n.exists(STUDENT)).toBe(false);
  });

  it("are not taken as loaded because grading's messages hold an English bundle", async () => {
    const { default: i18n, loadSurface, setLocale } = await start();
    await loadSurface("teacher");
    await import("@/features/attempts/gradingMessages");
    expect(i18n.hasResourceBundle("en", "translation")).toBe(true);

    await setLocale("en");

    expect(i18n.t("common.cancel")).toBe(en.common.cancel);
    expect(i18n.t(TEACHER)).toBe(en.builder.titleLabel);
  });
});
