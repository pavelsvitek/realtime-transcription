import type { SpeakerTagsStatus } from "./transcript-types";

export type AccessibilityNotice = {
  message: string;
  /** Why the grant will not stick, or how a stale Settings row can mislead. */
  signingHint: string | null;
};

/**
 * What to tell the user about Accessibility, or `null` when nothing is wrong.
 * Unknown status (still loading, or the query failed) is not "off": showing a
 * permission banner for a status we never read is what made it look stuck.
 *
 * `trusted` comes from `AXIsProcessTrustedWithOptions` for **this** process.
 * A toggle that is on for a different Amie install (old ad-hoc cdhash, or
 * “Amie Dev” vs “Amie”) does not count.
 */
export function accessibilityNotice(
  status: SpeakerTagsStatus | undefined,
): AccessibilityNotice | null {
  if (!status || status.trusted) return null;
  return {
    message: `Speaker names need Accessibility for ${status.buildLabel}. ${entryInstruction(status)}`,
    signingHint: signingHint(status),
  };
}

/**
 * Each build is its own entry in the Accessibility list. The dev build sits
 * next to the release app, and turning on the wrong one leaves this build off.
 */
function entryInstruction(status: SpeakerTagsStatus): string {
  const where = "In System Settings → Privacy & Security → Accessibility";
  const path = status.bundlePath ? ` (${status.bundlePath})` : "";
  if (isDevBuild(status)) {
    return `${where}, turn on “${status.buildLabel}”${path} (not “Amie”, which is the release app).`;
  }
  if (!hasStableSignature(status)) {
    return `${where}, turn on the “${status.buildLabel}” entry for this install${path}. If a toggle is already on but this banner stays, select every older “${status.buildLabel}” row, remove it with −, click Allow Accessibility here, enable the new row, then quit and reopen.`;
  }
  return `${where}, turn on “${status.buildLabel}”${path}.`;
}

function signingHint(status: SpeakerTagsStatus): string | null {
  if (hasStableSignature(status)) return null;
  if (isDevBuild(status)) {
    return "This build is not signed with a certificate, so macOS forgets the permission whenever it is rebuilt. Run `pnpm setup:signing` once, then restart.";
  }
  return "This release is ad-hoc signed, so each new download can look like a different app to macOS even when System Settings still shows Amie as on. After updating, remove stale Amie rows, allow Accessibility again, then quit and reopen.";
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

/** Short fingerprint of the TCC code identity, for Settings diagnostics. */
export function codeRequirementLabel(status: SpeakerTagsStatus): string | null {
  const requirement = status.codeRequirement?.trim();
  if (!requirement) return null;
  const cdhash = requirement.match(/cdhash\s+H\"([0-9a-fA-F]+)\"/i);
  if (cdhash?.[1]) {
    return `cdhash ${cdhash[1].slice(0, 12)}…`;
  }
  if (requirement.length <= 72) return requirement;
  return `${requirement.slice(0, 69)}…`;
}
