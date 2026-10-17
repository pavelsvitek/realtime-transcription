import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "@tauri-apps/plugin-updater";
import { EVENT_CHECK_FOR_UPDATES } from "../lib/tauri-events";
import {
  checkForAppUpdate,
  downloadAndInstallUpdate,
  formatUpdateError,
  getAppInstallLocation,
  relaunchApp,
  type UpdateProgress,
} from "../lib/updates";
import { UpdateDialog, type UpdateDialogView } from "./UpdateDialog";

type UpdateProviderProps = {
  /** True while a live transcription session is active or starting. */
  meetingActive: boolean;
};

/**
 * Owns the Check for Updates flow. Menu clicks (and any future Settings button)
 * share this single code path.
 */
export function UpdateProvider({ meetingActive }: UpdateProviderProps) {
  const [view, setView] = useState<UpdateDialogView | null>(null);
  const [busy, setBusy] = useState(false);
  const updateRef = useRef<Update | null>(null);
  const checkingRef = useRef(false);
  const meetingActiveRef = useRef(meetingActive);

  useEffect(() => {
    meetingActiveRef.current = meetingActive;
    setView((current) => {
      if (!current) return current;
      if (current.kind === "available") {
        return { ...current, meetingActive };
      }
      if (current.kind === "installedDeferred") {
        return { ...current, meetingActive };
      }
      return current;
    });
  }, [meetingActive]);

  const closePendingUpdate = useCallback(async () => {
    const pending = updateRef.current;
    updateRef.current = null;
    if (pending) {
      try {
        await pending.close();
      } catch {
        // Resource may already be consumed after install.
      }
    }
  }, []);

  const dismiss = useCallback(async () => {
    if (busy) return;
    await closePendingUpdate();
    setView(null);
  }, [busy, closePendingUpdate]);

  const runCheck = useCallback(async () => {
    if (checkingRef.current || busy) return;
    checkingRef.current = true;
    setBusy(true);
    setView({ kind: "checking" });

    try {
      const location = await getAppInstallLocation();
      if (!location.writable) {
        await closePendingUpdate();
        setView({
          kind: "readOnly",
          onRemovableVolume: location.onRemovableVolume,
        });
        return;
      }

      const update = await checkForAppUpdate();
      if (!update) {
        await closePendingUpdate();
        const version = await getVersion().catch(() => "this build");
        setView({ kind: "upToDate", version });
        return;
      }

      await closePendingUpdate();
      updateRef.current = update;
      setView({
        kind: "available",
        version: update.version,
        currentVersion: update.currentVersion,
        notes: update.body ?? null,
        meetingActive: meetingActiveRef.current,
        readOnlyBundle: false,
      });
    } catch (error) {
      await closePendingUpdate();
      setView({ kind: "error", message: formatUpdateError(error) });
    } finally {
      checkingRef.current = false;
      setBusy(false);
    }
  }, [busy, closePendingUpdate]);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busy) return;

    setBusy(true);
    const version = update.version;
    setView({
      kind: "downloading",
      version,
      progress: { downloaded: 0, contentLength: null },
    });

    try {
      await downloadAndInstallUpdate(update, (progress: UpdateProgress) => {
        setView({ kind: "downloading", version, progress });
      });
      updateRef.current = null;

      // Never relaunch during a live meeting — defer until Stop.
      if (meetingActiveRef.current) {
        setView({
          kind: "installedDeferred",
          version,
          meetingActive: true,
        });
        return;
      }

      await relaunchApp();
    } catch (error) {
      setView({ kind: "error", message: formatUpdateError(error) });
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const relaunchNow = useCallback(async () => {
    if (meetingActiveRef.current || busy) return;
    setBusy(true);
    try {
      await relaunchApp();
    } catch (error) {
      setView({ kind: "error", message: formatUpdateError(error) });
      setBusy(false);
    }
  }, [busy]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    listen(EVENT_CHECK_FOR_UPDATES, () => {
      void runCheck();
    })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((error) => {
        console.warn("Failed to listen for check-for-updates menu event", error);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [runCheck]);

  // When a deferred install is waiting and the meeting ends, refresh the CTA.
  useEffect(() => {
    if (view?.kind !== "installedDeferred") return;
    if (meetingActive) return;
    setView({ kind: "installedDeferred", version: view.version, meetingActive: false });
  }, [meetingActive, view]);

  if (!view) return null;

  return (
    <UpdateDialog
      view={view}
      busy={busy}
      onUpdate={() => {
        void installUpdate();
      }}
      onLater={() => {
        void dismiss();
      }}
      onDismiss={() => {
        void dismiss();
      }}
      onRelaunch={() => {
        void relaunchNow();
      }}
    />
  );
}
