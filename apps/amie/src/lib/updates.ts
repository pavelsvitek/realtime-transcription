import { invoke } from "@tauri-apps/api/core";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type AppInstallLocation = {
  writable: boolean;
  executablePath: string | null;
  onRemovableVolume: boolean;
};

export type UpdateProgress = {
  downloaded: number;
  contentLength: number | null;
};

export function isDevBuild(): boolean {
  return import.meta.env.DEV;
}

export async function getAppInstallLocation(): Promise<AppInstallLocation> {
  return invoke<AppInstallLocation>("get_app_install_location");
}

export function formatUpdateError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/empty endpoints|does not have any endpoints/i.test(raw)) {
    return "Update checks are disabled in this build.";
  }
  if (/404|not found/i.test(raw)) {
    return "No update feed is published yet. Check again after a GitHub Release exists.";
  }
  if (/network|fetch|dns|timed out|timeout|connection/i.test(raw)) {
    return "Could not reach the update server. Check your network and try again.";
  }
  if (/signature|minisign|verify/i.test(raw)) {
    return "The update failed signature verification. The installed app was left unchanged.";
  }
  return raw || "Something went wrong while checking for updates.";
}

export async function checkForAppUpdate(): Promise<Update | null> {
  if (isDevBuild()) {
    // `tauri dev` also overlays empty endpoints; fail closed before any network call.
    throw new Error("Update checks are disabled in development builds.");
  }
  return check();
}

export async function downloadAndInstallUpdate(
  update: Update,
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | null = null;

  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? null;
        downloaded = 0;
        onProgress({ downloaded, contentLength });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress({ downloaded, contentLength });
        break;
      case "Finished":
        onProgress({ downloaded, contentLength });
        break;
    }
  });
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}
