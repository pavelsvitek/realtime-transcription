import { describe, expect, it } from "vitest";
import {
  accessibilityNotice,
  codeRequirementLabel,
  hasStableSignature,
  signatureLabel,
} from "./speaker-tags";
import type { SpeakerTagsStatus } from "./transcript-types";

const status = (overrides: Partial<SpeakerTagsStatus> = {}): SpeakerTagsStatus => ({
  trusted: false,
  meetingApp: null,
  buildLabel: "Amie Dev",
  bundlePath: "/w/amie-dev.app",
  bundleId: "com.pavel.amie.dev",
  signature: "identity",
  signer: "Amie Local Signing",
  codeRequirement: 'identifier "com.pavel.amie.dev" and certificate leaf = H"abc"',
  googleMeetExtension: {
    connected: false,
    browsers: [],
    inCallTabs: 0,
    extensionVersion: null,
    health: "unknown",
    remoteSpeaking: [],
    selfSpeaking: [],
  },
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
    expect(notice?.message).toContain("/w/amie-dev.app");
    expect(notice?.signingHint).toBeNull();
  });

  it("tells a dev build apart from the release app listed beside it", () => {
    expect(accessibilityNotice(status())?.message).toContain("not “Amie”");
    const release = status({
      buildLabel: "Amie",
      bundleId: "com.pavel.amie",
      bundlePath: "/Applications/Amie.app",
      signature: "identity",
    });
    const message = accessibilityNotice(release)?.message ?? "";
    expect(message).toContain("turn on “Amie”");
    expect(message).toContain("/Applications/Amie.app");
    expect(message).not.toContain("select every older");
  });

  it("explains stale Settings rows for an ad-hoc release install", () => {
    const release = status({
      buildLabel: "Amie",
      bundleId: "com.pavel.amie",
      bundlePath: "/Applications/Amie.app",
      signature: "adHoc",
      signer: null,
      codeRequirement: 'cdhash H"4084ac8c8b3bdf6d8738e4630a533cc13a486dab"',
    });
    const notice = accessibilityNotice(release);
    expect(notice?.message).toContain("select every older");
    expect(notice?.message).toContain("remove it with");
    expect(notice?.message).toContain("/Applications/Amie.app");
    expect(notice?.signingHint).toContain("ad-hoc signed");
    expect(notice?.signingHint).not.toContain("pnpm setup:signing");
  });

  it("keeps the developer signing hint on unstable dev builds", () => {
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

  it("shortens a cdhash requirement for Settings", () => {
    expect(
      codeRequirementLabel(
        status({
          codeRequirement: 'cdhash H"4084ac8c8b3bdf6d8738e4630a533cc13a486dab"',
        }),
      ),
    ).toBe("cdhash 4084ac8c8b3b…");
    expect(codeRequirementLabel(status({ codeRequirement: null }))).toBeNull();
  });
});
