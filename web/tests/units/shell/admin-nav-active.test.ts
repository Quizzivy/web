import { describe, expect, it } from "vitest";
import { activeAdminNavId } from "@/layouts/adminNav";

describe("the Admin sidebar's lit destination", () => {
  it("is the destination whose path the page is at or beneath", () => {
    expect(activeAdminNavId("/admin")).toBe("overview");
    expect(activeAdminNavId("/admin/users")).toBe("users");
    expect(activeAdminNavId("/admin/leads/42")).toBe("leads");
    expect(activeAdminNavId("/admin/settings/retention/")).toBe("settings");
  });

  // SS-18, the owner's call of 2026-11-15: an export is reached from System settings.
  it("is System settings on an export page", () => {
    expect(
      activeAdminNavId("/admin/exports/0193e5d2-6f4e-7c1a-9a51-111111111111"),
    ).toBe("settings");
  });

  it("is none on a path no destination holds", () => {
    expect(activeAdminNavId("/admin/elsewhere")).toBeNull();
    expect(activeAdminNavId("/admin/exportsx")).toBeNull();
  });
});
