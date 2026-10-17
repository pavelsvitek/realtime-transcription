import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_SEEN_STORAGE_KEY,
  clearOnboardingSeen,
  downloadFooterStatus,
  formatModelSize,
  hasSeenOnboarding,
  markOnboardingSeen,
  shouldShowOnboarding,
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

  it("formats footer download progress percent", () => {
    expect(downloadFooterStatus(0)).toBe("Downloading speech model… 0%");
    expect(downloadFooterStatus(42)).toBe("Downloading speech model… 42%");
    expect(downloadFooterStatus(100)).toBe("Downloading speech model… 100%");
  });

  it("shows every launch until the model is downloaded", () => {
    expect(
      shouldShowOnboarding({ force: false, modelReady: false, seen: true }),
    ).toBe(true);
    expect(
      shouldShowOnboarding({ force: false, modelReady: false, seen: false }),
    ).toBe(true);
  });

  it("hides after seen once the model is ready unless forced", () => {
    expect(
      shouldShowOnboarding({ force: false, modelReady: true, seen: true }),
    ).toBe(false);
    expect(
      shouldShowOnboarding({ force: false, modelReady: true, seen: false }),
    ).toBe(true);
    expect(
      shouldShowOnboarding({ force: true, modelReady: true, seen: true }),
    ).toBe(true);
  });
});
