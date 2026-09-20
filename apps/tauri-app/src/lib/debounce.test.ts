import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebouncer } from "./debounce";

describe("createDebouncer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves once after the delay, using the latest value", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debouncer = createDebouncer(250, fn);

    debouncer.schedule("a");
    vi.advanceTimersByTime(249);
    debouncer.schedule("b");
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("flush writes immediately and skips a later timer", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debouncer = createDebouncer(250, fn);

    debouncer.schedule("draft");
    expect(debouncer.flush()).toBe("draft");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("draft");

    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
