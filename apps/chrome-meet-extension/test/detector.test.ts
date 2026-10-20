/** Google Meet extension speaker-tracking — detector replays. */
import { describe, expect, it } from "vitest";
import { createDetector, type MeterEvent } from "../src/content/detector";

function prime(detector: ReturnType<typeof createDetector>, id: string, at = 0, tokens = "idle") {
  detector.onMeter({ participantId: id, meterId: `${id}-tile`, at, tokens });
}

function flicker(detector: ReturnType<typeof createDetector>, id: string, at: number, tokens: string) {
  const event: MeterEvent = { participantId: id, meterId: `${id}-tile`, at, tokens };
  detector.onMeter(event);
}

describe("Meet meter detector", () => {
  it("marks a speaker on the second flicker and ignores a single blip", () => {
    const detector = createDetector();
    prime(detector, "ada");
    flicker(detector, "ada", 100, "loud");
    expect(detector.speaking(120).has("ada")).toBe(false);
    flicker(detector, "ada", 200, "louder");
    expect(detector.speaking(220).has("ada")).toBe(true);
  });

  it("does not treat a change that returns to idle as speech", () => {
    const detector = createDetector();
    prime(detector, "ada", 0, "idle");
    detector.speaking(1_600);
    flicker(detector, "ada", 2_000, "loud");
    flicker(detector, "ada", 2_050, "idle");
    expect(detector.speaking(2_080).has("ada")).toBe(false);
  });

  it("keeps a held non-idle level and hangs over a short gap", () => {
    const detector = createDetector();
    prime(detector, "ada", 0, "idle");
    detector.speaking(1_600);
    flicker(detector, "ada", 1_700, "loud-a");
    flicker(detector, "ada", 1_800, "loud-b");
    expect(detector.speaking(1_850).has("ada")).toBe(true);
    expect(detector.speaking(2_400).has("ada")).toBe(true);
    flicker(detector, "ada", 2_500, "idle");
    detector.speaking(2_500);
    expect(detector.speaking(2_700).has("ada")).toBe(true);
    expect(detector.speaking(3_100).has("ada")).toBe(false);
  });

  it("hands off and overlaps", () => {
    const detector = createDetector();
    prime(detector, "ada");
    prime(detector, "grace");
    flicker(detector, "ada", 100, "a1");
    flicker(detector, "ada", 200, "a2");
    flicker(detector, "grace", 200, "g1");
    flicker(detector, "grace", 280, "g2");
    const both = detector.speaking(300);
    expect(both.has("ada")).toBe(true);
    expect(both.has("grace")).toBe(true);
    flicker(detector, "ada", 400, "idle");
    detector.speaking(2_000);
    flicker(detector, "grace", 2_100, "g3");
    flicker(detector, "grace", 2_200, "g4");
    const next = detector.speaking(2_250);
    expect(next.has("ada")).toBe(false);
    expect(next.has("grace")).toBe(true);
  });

  it("survives a meter token rename", () => {
    const run = (rename: (token: string) => string) => {
      const detector = createDetector();
      prime(detector, "ada", 0, rename("idle"));
      flicker(detector, "ada", 100, rename("l1"));
      flicker(detector, "ada", 200, rename("l2"));
      return detector.speaking(220).has("ada");
    };
    expect(run((token) => token)).toBe(true);
    expect(run((token) => `x-${token}`)).toBe(true);
  });

  it("leaves a muted participant out", () => {
    const detector = createDetector();
    prime(detector, "ada");
    prime(detector, "muted");
    flicker(detector, "ada", 100, "a1");
    flicker(detector, "ada", 200, "a2");
    expect([...detector.speaking(220)]).toEqual(["ada"]);
  });
});
