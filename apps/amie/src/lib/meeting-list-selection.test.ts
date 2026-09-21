import { describe, expect, it } from "vitest";
import {
  moveMeetingSelection,
  retainMeetingSelection,
} from "./meeting-list-selection";

const ids = ["a", "b", "c"];

describe("moveMeetingSelection", () => {
  it("starts at the top on Arrow Down and the bottom on Arrow Up", () => {
    expect(moveMeetingSelection(ids, null, "down")).toBe("a");
    expect(moveMeetingSelection(ids, null, "up")).toBe("c");
  });

  it("moves through the list and stops at the ends", () => {
    expect(moveMeetingSelection(ids, "a", "down")).toBe("b");
    expect(moveMeetingSelection(ids, "b", "down")).toBe("c");
    expect(moveMeetingSelection(ids, "c", "down")).toBe("c");
    expect(moveMeetingSelection(ids, "c", "up")).toBe("b");
    expect(moveMeetingSelection(ids, "a", "up")).toBe("a");
  });

  it("does nothing when the list is empty", () => {
    expect(moveMeetingSelection([], null, "down")).toBeNull();
    expect(moveMeetingSelection([], "a", "up")).toBeNull();
  });

  it("restarts from the end that matches the arrow when the id is gone", () => {
    expect(moveMeetingSelection(ids, "missing", "down")).toBe("a");
    expect(moveMeetingSelection(ids, "missing", "up")).toBe("c");
  });
});

describe("retainMeetingSelection", () => {
  it("keeps the same meeting when it is still in the list", () => {
    expect(retainMeetingSelection(ids, ["c", "a", "b"], "b")).toBe("b");
  });

  it("moves to the row that took the missing meeting's place", () => {
    expect(retainMeetingSelection(ids, ["a", "c"], "b")).toBe("c");
  });

  it("moves to the new last row when the last meeting disappears", () => {
    expect(retainMeetingSelection(ids, ["a", "b"], "c")).toBe("b");
  });

  it("clears selection when the list becomes empty", () => {
    expect(retainMeetingSelection(ids, [], "b")).toBeNull();
  });

  it("leaves an empty selection empty", () => {
    expect(retainMeetingSelection(ids, ["a"], null)).toBeNull();
  });
});
