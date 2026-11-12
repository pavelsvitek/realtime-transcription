/** Oldest macOS release Amie runs on (tauri.conf.json `minimumSystemVersion`). */
export const MIN_MACOS_MAJOR = 15;

/** Public GitHub releases feed the Mac app is shipped from. */
export const RELEASES_API =
  "https://api.github.com/repos/pavelsvitek/realtime-transcription/releases/latest";
export const RELEASES_PAGE =
  "https://github.com/pavelsvitek/realtime-transcription/releases/latest";

export type OsId =
  | "macos"
  | "windows"
  | "linux"
  | "ios"
  | "ipados"
  | "android"
  | "chromeos"
  | "unknown";

const OS_LABELS: Record<OsId, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  ios: "iOS",
  ipados: "iPadOS",
  android: "Android",
  chromeos: "ChromeOS",
  unknown: "your operating system",
};

export type Platform = {
  os: OsId;
  /** Human name for the popup, e.g. "Windows" or "macOS 14". */
  label: string;
  supported: boolean;
};

type UAData = {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ platformVersion?: string }>;
};

function uaData(): UAData | undefined {
  return (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
}

function detectOs(): OsId {
  const ua = navigator.userAgent;
  const platform = uaData()?.platform ?? navigator.platform ?? "";
  if (/android/i.test(ua)) return "android";
  if (/iPhone|iPod/i.test(ua)) return "ios";
  if (/iPad/i.test(ua)) return "ipados";
  if (/CrOS/i.test(ua)) return "chromeos";
  if (/win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/mac/i.test(platform) || /Macintosh/i.test(ua)) {
    // iPadOS Safari pretends to be a Mac but has a touch screen.
    return navigator.maxTouchPoints > 1 ? "ipados" : "macos";
  }
  if (/linux|x11/i.test(platform) || /Linux|X11/i.test(ua)) return "linux";
  return "unknown";
}

function toPlatform(os: OsId, macMajor?: number): Platform {
  if (os === "macos" && macMajor !== undefined && macMajor < MIN_MACOS_MAJOR) {
    return { os, label: `macOS ${macMajor}`, supported: false };
  }
  return {
    os,
    label: OS_LABELS[os],
    // Unknown OS: let the click through rather than wrongly blocking it.
    supported: os === "macos" || os === "unknown",
  };
}

/** Synchronous best guess from the user agent. Browser only. */
export function detectPlatform(): Platform {
  return toPlatform(detectOs());
}

/**
 * Adds the macOS version where the browser exposes it (Chromium via
 * User-Agent Client Hints). Safari and Firefox freeze it at 10.15, so for
 * them we assume the Mac is new enough and let the app enforce the minimum.
 */
export async function detectPlatformPrecise(): Promise<Platform> {
  const os = detectOs();
  if (os !== "macos") return toPlatform(os);
  try {
    const hints = await uaData()?.getHighEntropyValues?.(["platformVersion"]);
    const major = parseInt(hints?.platformVersion ?? "", 10);
    if (Number.isFinite(major) && major >= 11) return toPlatform(os, major);
  } catch {
    // Hint denied or unavailable: fall through.
  }
  return toPlatform(os);
}

/** Direct link to the latest Apple-silicon DMG, or the releases page if unavailable. */
export async function resolveDownloadUrl(): Promise<string> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return RELEASES_PAGE;
    const release = (await res.json()) as {
      assets?: { name: string; browser_download_url: string }[];
    };
    const dmg = release.assets?.find((a) => a.name.endsWith("_aarch64.dmg"));
    return dmg?.browser_download_url ?? RELEASES_PAGE;
  } catch {
    return RELEASES_PAGE;
  }
}
