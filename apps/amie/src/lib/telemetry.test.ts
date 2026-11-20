import { describe, expect, it } from "vitest";
import { getTelemetrySettings, setTelemetryEnabled, trackEvent } from "./telemetry";

describe("telemetry frontend helper", () => {
  it("no-ops safely outside Tauri runtime", async () => {
    expect(() => trackEvent("feature_used", { feature: "summary" })).not.toThrow();
    await expect(getTelemetrySettings()).resolves.toEqual({ enabled: true });
    await expect(setTelemetryEnabled(false)).resolves.toBeUndefined();
  });
});
