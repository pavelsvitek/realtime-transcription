import { useEffect, useRef, useState } from "react";
import {
  MIN_MACOS_MAJOR,
  detectPlatformPrecise,
  resolveDownloadUrl,
  type Platform,
} from "@/lib/platform";

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
  className: string;
  children: React.ReactNode;
};

/** Download button that starts the DMG on supported Macs and explains otherwise. */
export function DownloadButton({ className, children }: Props) {
  const platform = usePlatform();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
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
            Unfortunately, {platform.label} is not supported.
          </p>
          <p className="text-sm text-raycast-on-dark-mute">
            Amie runs on macOS {MIN_MACOS_MAJOR} or later.
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

/** "macOS 15+ supported" note shown under the main Download button. */
export function DownloadSupportNote() {
  return (
    <p className="text-sm text-raycast-mute">
      macOS {MIN_MACOS_MAJOR}+ supported
    </p>
  );
}
