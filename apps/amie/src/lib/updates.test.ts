import { describe, expect, it } from "vitest";
import { formatBytes, formatUpdateError } from "./updates";

describe("formatUpdateError", () => {
  it("maps empty-endpoints errors to a clear disabled message", () => {
    expect(
      formatUpdateError(new Error("Updater does not have any endpoints set.")),
    ).toBe("Update checks are disabled in this build.");
  });

  it("maps 404-style failures to a missing-feed message", () => {
    expect(formatUpdateError(new Error("Request failed with 404 Not Found"))).toMatch(
      /No update feed is published yet/,
    );
  });
});

describe("formatBytes", () => {
  it("formats byte counts for the progress label", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
