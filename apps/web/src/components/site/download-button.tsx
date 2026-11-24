import { useEffect, useRef, useState } from "react";
import {
  MIN_MACOS_MAJOR,
  detectPlatformPrecise,
  resolveDownloadUrl,
  type Platform,
} from "@/lib/platform";
import { track } from "@/lib/track";

// Server render assumes a Mac so the first paint matches the happy path;
// the real platform is picked up after hydration.
const SSR_PLATFORM: Platform = { os: "macos", label: "macOS", supported: true };

function usePlatform(): Platform {
  const [platform, setPlatform] = useState(SSR_PLATFORM);
  useEffect(() => {
    let live = true;
    detectPlatformPrecise().then((p) => live && setPlatform(p));
    return () => {
      live = false;
    };
  }, []);
  return platform;
}

type Props = {
  /** Where on the page the button sits, recorded with the click event. */
  location: "hero" | "nav" | "faq";
  className: string;
  children: React.ReactNode;
};

/** Download button that starts the DMG on supported Macs and explains otherwise. */
export function DownloadButton({ location, className, children }: Props) {
  const platform = usePlatform();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    track(platform.supported ? "download_click" : "download_unsupported", {
      location,
      os: platform.os,
    });
    if (!platform.supported) {
      dialogRef.current?.showModal();
      return;
    }
    setBusy(true);
    const url = await resolveDownloadUrl();
    setBusy(false);
    window.location.assign(url);
  }

  return (
    <>
      <button type="button" onClick={onClick} disabled={busy} className={className}>
        {children}
      </button>
      <dialog
        ref={dialogRef}
        onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
        className="m-auto w-[min(92vw,380px)] rounded-xl border border-raycast-hairline-strong bg-raycast-surface-elevated p-6 text-raycast-ink backdrop:bg-black/60"
      >
        <form method="dialog" className="flex flex-col gap-4">
          <p className="text-lg leading-6 font-semibold">
            {platform.os === "macos"
              ? "Your macOS version isn’t supported"
              : "Amie is only available for Mac"}
          </p>
          <p className="text-sm text-raycast-on-dark-mute">
            You’re on {platform.label}. Amie requires macOS {MIN_MACOS_MAJOR} or
            later.
          </p>
          <button
            autoFocus
            className="flex h-9 items-center justify-center rounded-md bg-raycast-primary px-4 text-base font-semibold text-raycast-on-primary"
          >
            Got it
          </button>
        </form>
      </dialog>
    </>
  );
}

/** Requirements note shown under the main Download button. */
export function DownloadSupportNote() {
  return (
    <p className="text-center text-sm text-raycast-mute">
      For macOS {MIN_MACOS_MAJOR} or later (Apple Silicon) · Auto-detects 25
      European languages
    </p>
  );
}
