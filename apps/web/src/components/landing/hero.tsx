import {
  DownloadButton,
  DownloadSupportNote,
} from "@/components/site/download-button";

/** A bot head with a slash: Amie listens on your Mac, nothing joins the call. */
function NoBotIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-raycast-on-dark-mute"
      aria-hidden
    >
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4" />
      <circle cx="12" cy="3" r="1" />
      <path d="M9 14h.01M15 14h.01" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function Hero() {
  return (
    <div className="relative z-10 flex flex-col items-center gap-[12px] pt-16">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded px-2 py-0.5 bg-raycast-accent-red-soft">
          <span className="size-1.5 shrink-0 rounded-full bg-raycast-accent-red" />
          <span className="text-xs leading-[18px] font-medium tracking-[0.033em] text-raycast-accent-red">
            Live · on device
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded border border-raycast-hairline-strong px-2 py-0.5">
          <NoBotIcon />
          <span className="text-xs leading-[18px] font-medium tracking-[0.033em] text-raycast-on-dark-mute">
            No bot on your call
          </span>
        </div>
      </div>
      <h1 className="flex flex-col items-center">
        <span className="w-[900px] text-center text-[64px] leading-[70px] font-semibold text-raycast-ink">
          Your meetings, transcribed
        </span>
        <span className="text-center text-[64px] leading-[70px] font-semibold text-raycast-mute">
          on your Mac.
        </span>
      </h1>
      <p className="w-[560px] text-center text-lg text-raycast-on-dark-mute">
        Amie writes every word as it’s said, from your mic and your calls. Local
        by default.
      </p>
      <div id="download" className="flex items-start gap-3 pt-1">
        <div className="flex flex-col items-center gap-2">
          <DownloadButton className="flex h-11 cursor-pointer items-center justify-center rounded-lg bg-raycast-primary px-6 text-lg leading-6 font-semibold tracking-[0.014em] text-raycast-on-primary disabled:opacity-70">
            Download for Mac
          </DownloadButton>
          <DownloadSupportNote />
        </div>
        <a
          href="#word-by-word"
          className="flex h-11 items-center justify-center rounded-lg border border-raycast-hairline-strong px-6 text-lg leading-6 font-semibold tracking-[0.014em] text-raycast-ink"
        >
          How it works
        </a>
      </div>
    </div>
  );
}
