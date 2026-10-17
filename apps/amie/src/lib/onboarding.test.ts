import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_SEEN_STORAGE_KEY,
  clearOnboardingSeen,
  formatModelSize,
  hasSeenOnboarding,
  markOnboardingSeen,
} from "./onboarding";

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
}

describe("onboarding prefs", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    clearOnboardingSeen();
  });

  it("starts unseen", () => {
    expect(hasSeenOnboarding()).toBe(false);
  });

  it("marks seen in localStorage", () => {
    markOnboardingSeen();
    expect(hasSeenOnboarding()).toBe(true);
    expect(localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY)).toBe("1");
  });

  it("formats the known model size without naming the model", () => {
    expect(formatModelSize()).toBe("about 612 MB");
  });
});
