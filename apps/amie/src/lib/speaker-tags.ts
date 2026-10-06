import type { SpeakerTagsStatus } from "./transcript-types";

export type AccessibilityNotice = {
  message: string;
  /** Why the grant will not stick, when this build's signature is the cause. */
  signingHint: string | null;
};

/**
 * What to tell the user about Accessibility, or `null` when nothing is wrong.
 * Unknown status (still loading, or the query failed) is not "off": showing a
 * permission banner for a status we never read is what made it look stuck.
 */
export function accessibilityNotice(
  status: SpeakerTagsStatus | undefined,
): AccessibilityNotice | null {
  if (!status || status.trusted) return null;
  return {
    message: `Speaker names need Accessibility for ${status.buildLabel}. ${entryInstruction(status)}`,
    signingHint: hasStableSignature(status)
      ? null
      : "This build is not signed with a certificate, so macOS forgets the permission whenever it is rebuilt. Run `pnpm setup:signing` once, then restart.",
  };
}

/**
 * Each build is its own entry in the Accessibility list. The dev build sits
 * next to the release app, and turning on the wrong one leaves this build off.
 */
function entryInstruction(status: SpeakerTagsStatus): string {
  const where = "In System Settings → Privacy & Security → Accessibility";
  if (isDevBuild(status)) {
    return `${where}, turn on “${status.buildLabel}” (not “Amie”, which is the release app).`;
  }
  return `${where}, turn on “${status.buildLabel}”.`;
}

function isDevBuild(status: SpeakerTagsStatus): boolean {
  return status.bundleId?.endsWith(".dev") ?? false;
}

export function hasStableSignature(status: SpeakerTagsStatus): boolean {
  return status.signature === "identity";
}

export function signatureLabel(status: SpeakerTagsStatus): string {
  switch (status.signature) {
    case "identity":
      return status.signer ? `Signed by ${status.signer}` : "Signed with a certificate";
    case "adHoc":
      return "Ad-hoc (permission is lost on rebuild)";
    case "unsigned":
      return "Unsigned (permission is lost on rebuild)";
    default:
      return "Unknown";
  }
}
