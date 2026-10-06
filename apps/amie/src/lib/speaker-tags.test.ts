import { describe, expect, it } from "vitest";
import { accessibilityNotice, hasStableSignature, signatureLabel } from "./speaker-tags";
import type { SpeakerTagsStatus } from "./transcript-types";

const status = (overrides: Partial<SpeakerTagsStatus> = {}): SpeakerTagsStatus => ({
  trusted: false,
  meetingApp: null,
  buildLabel: "Amie Dev",
  bundlePath: "/w/amie-dev.app",
  bundleId: "com.pavel.amie.dev",
  signature: "identity",
  signer: "Amie Local Signing",
  ...overrides,
});

describe("accessibilityNotice", () => {
  it("stays quiet while status is unknown or the permission is on", () => {
    expect(accessibilityNotice(undefined)).toBeNull();
    expect(accessibilityNotice(status({ trusted: true }))).toBeNull();
  });

  it("names the build that needs the permission", () => {
    const notice = accessibilityNotice(status());
    expect(notice?.message).toContain("“Amie Dev”");
    expect(notice?.signingHint).toBeNull();
  });

  it("tells a dev build apart from the release app listed beside it", () => {
    expect(accessibilityNotice(status())?.message).toContain("not “Amie”");
    const release = status({ buildLabel: "Amie", bundleId: "com.pavel.amie" });
    const message = accessibilityNotice(release)?.message ?? "";
    expect(message).toContain("turn on “Amie”.");
    expect(message).not.toContain("release app");
  });

  it("explains an unstable signature as the reason the grant will not stick", () => {
    expect(accessibilityNotice(status({ signature: "adHoc", signer: null }))?.signingHint)
      .toContain("pnpm setup:signing");
    expect(accessibilityNotice(status({ signature: "unsigned", signer: null }))?.signingHint)
      .toContain("pnpm setup:signing");
  });
});

describe("signature helpers", () => {
  it("treats only a certificate signature as stable", () => {
    expect(hasStableSignature(status())).toBe(true);
    expect(hasStableSignature(status({ signature: "adHoc" }))).toBe(false);
    expect(hasStableSignature(status({ signature: "unknown" }))).toBe(false);
  });

  it("labels each signature kind", () => {
    expect(signatureLabel(status())).toBe("Signed by Amie Local Signing");
    expect(signatureLabel(status({ signature: "adHoc", signer: null }))).toContain("Ad-hoc");
    expect(signatureLabel(status({ signature: "unsigned", signer: null }))).toContain("Unsigned");
    expect(signatureLabel(status({ signature: "unknown", signer: null }))).toBe("Unknown");
  });
});
