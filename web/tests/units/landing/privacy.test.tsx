import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import PrivacyPage from "@/features/landing/pages/PrivacyPage";
import { PRIVACY_NOTICE } from "@/features/landing/site";
import { CENTRE, landingBuild, readIn, renderLanding } from "@tests/support/landing";

beforeEach(() => readIn("vi"));
afterEach(() => vi.unstubAllEnvs());

function setup() {
  renderLanding(<PrivacyPage />);
}

describe("the privacy notice", () => {
  // Fails when the page shows another version than the one the form sends.
  it("shows the version the form sends, and the day it took effect", () => {
    landingBuild();
    setup();
    expect(PRIVACY_NOTICE.version).toBe("2026-11");
    expect(
      screen.getByText("Phiên bản 2026-11 · có hiệu lực từ 15/11/2026"),
    ).toBeInTheDocument();
  });

  // Fails when a part of the notice is dropped or its numbering slips.
  it("has eleven numbered parts under the four facts", () => {
    landingBuild();
    setup();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(12);
    expect(
      screen.getByRole("heading", { name: /^11\s*Khi thông báo thay đổi$/ }),
    ).toBeInTheDocument();
  });

  // Fails when the centre's card or the ways to reach it print a line the build left unset.
  it("names the centre by the lines the build sets, and leaves the others out", () => {
    landingBuild(["email", "address"]);
    setup();
    expect(screen.getByText(CENTRE.name)).toBeInTheDocument();
    expect(screen.getByText(CENTRE.phone)).toBeInTheDocument();
    expect(screen.queryByText(CENTRE.email)).toBeNull();
    expect(screen.queryByText(CENTRE.address)).toBeNull();
    expect(
      screen.getByText(`Để dùng các quyền này, gọi ${CENTRE.phone}.`),
    ).toBeInTheDocument();
  });

  // Fails when the English notice keeps the Vietnamese date or address.
  it("reads in English, with the address in English", async () => {
    landingBuild();
    await readIn("en");
    setup();
    expect(
      screen.getByText("Version 2026-11 · in effect from 15 Nov 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText(CENTRE.addressEn)).toBeInTheDocument();
  });
});
