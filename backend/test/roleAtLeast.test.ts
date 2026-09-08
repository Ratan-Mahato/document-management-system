import { describe, it, expect } from "vitest";
import { roleAtLeast } from "../src/services/permission.service";

describe("roleAtLeast", () => {
  it("treats a null role as insufficient for any requirement", () => {
    expect(roleAtLeast(null, "VIEWER")).toBe(false);
    expect(roleAtLeast(null, "OWNER")).toBe(false);
  });

  it("honors the VIEWER < COMMENTER < EDITOR < OWNER ranking", () => {
    // Each role satisfies itself and everything below it.
    expect(roleAtLeast("VIEWER", "VIEWER")).toBe(true);
    expect(roleAtLeast("COMMENTER", "VIEWER")).toBe(true);
    expect(roleAtLeast("EDITOR", "COMMENTER")).toBe(true);
    expect(roleAtLeast("OWNER", "EDITOR")).toBe(true);
    expect(roleAtLeast("OWNER", "OWNER")).toBe(true);
  });

  it("rejects a role that ranks below the requirement", () => {
    expect(roleAtLeast("VIEWER", "COMMENTER")).toBe(false);
    expect(roleAtLeast("COMMENTER", "EDITOR")).toBe(false);
    expect(roleAtLeast("EDITOR", "OWNER")).toBe(false);
  });
});
