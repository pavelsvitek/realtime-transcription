import { describe, expect, it } from "vitest";
import { adoptRemoteContext } from "./MeetingContextEditor";

describe("adoptRemoteContext", () => {
  it("adopts a later seed when the editor is still at the saved blank value", () => {
    expect(
      adoptRemoteContext(
        "",
        "",
        "Pavel\n\n## Previous meeting summary\nShip it",
      ),
    ).toBe("Pavel\n\n## Previous meeting summary\nShip it");
  });

  it("does not clobber unsaved typing", () => {
    expect(adoptRemoteContext("typing", "", "Ship it")).toBeNull();
  });

  it("does nothing when the incoming value is already saved", () => {
    expect(adoptRemoteContext("Ship it", "Ship it", "Ship it")).toBeNull();
  });
});
