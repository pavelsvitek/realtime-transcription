import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("drops falsy values and joins the rest", () => {
    expect(cn("a", false, null, undefined, "b", { c: true, d: false })).toBe("a b c");
  });

  it("lets a later utility win over a conflicting earlier one", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });

  it("keeps font family and font weight apart", () => {
    expect(cn("font-[family-name:inherit] font-medium", "font-semibold")).toBe(
      "font-[family-name:inherit] font-semibold",
    );
  });

  it("merges the app's token colours by utility, not by name", () => {
    expect(cn("bg-surface-shell text-text-primary", "bg-brand-primary")).toBe(
      "text-text-primary bg-brand-primary",
    );
  });
});
