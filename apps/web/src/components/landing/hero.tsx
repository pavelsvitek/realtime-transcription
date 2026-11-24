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

/** Tapered concave cradle arc beneath "25 European languages" in the hero subhead. */
function LanguagesUnderline() {
  return (
    <svg
      viewBox="0 0 206 11"
      fill="none"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -right-0.5 -bottom-1.5 -left-0.5 h-[11px] w-[calc(100%+4px)]"
      aria-hidden
    >
      <path
        d="M 1.5 2.4 C 54 6.6, 152 6.6, 204.5 2.4 C 205.5 2.0, 205.6 3.3, 204.5 3.9 C 152 9.4, 54 9.4, 1.5 3.9 C 0.4 3.3, 0.5 2.0, 1.5 2.4 Z"
        fill="#6FB0DE"
      />
    </svg>
  );
}

/** Claude starburst mark used on the Works-with-Claude pill. */
function ClaudeStarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <path
        d="M12 2C12.4 5.2 13.4 7.2 15.5 9.3C17.6 11.4 19.6 12.4 22.8 12.8C19.6 13.2 17.6 14.2 15.5 16.3C13.4 18.4 12.4 20.4 12 23.6C11.6 20.4 10.6 18.4 8.5 16.3C6.4 14.2 4.4 13.2 1.2 12.8C4.4 12.4 6.4 11.4 8.5 9.3C10.6 7.2 11.6 5.2 12 2Z"
        fill="#D97757"
      />
    </svg>
  );
}

export function Hero() {
  return (
    <div className="relative z-10 flex flex-col items-center gap-3 px-5 pt-14 sm:pt-20 md:pt-24 xl:px-0 xl:pt-[112px]">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 rounded px-2 py-0.5 bg-raycast-accent-red-soft">
          <span className="size-1.5 shrink-0 rounded-full bg-raycast-accent-red" />
          <span className="text-xs leading-[18px] font-medium tracking-[0.033em] text-raycast-accent-red">
            Real-time · Runs on your Mac
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded border border-raycast-hairline-strong px-2 py-0.5">
          <NoBotIcon />
          <span className="text-xs leading-[18px] font-medium tracking-[0.033em] text-raycast-on-dark-mute">
            No bot joins your call
          </span>
        </div>
        <a
          href="#local-mcp"
          className="flex items-center gap-1.5 rounded border border-[#D97757]/40 bg-[#D97757]/16 px-2.5 py-0.5 transition-colors hover:border-[#D97757]/65"
        >
          <ClaudeStarIcon />
          <span className="text-xs leading-[18px] font-medium tracking-[0.033em] text-[#F0B496]">
            Works with Claude
          </span>
        </a>
      </div>
      <h1 className="flex flex-col items-center">
        <span className="max-w-[900px] text-center text-[40px] leading-[46px] font-semibold text-raycast-ink sm:text-[56px] sm:leading-[62px] xl:w-[900px] xl:text-[64px] xl:leading-[70px]">
          Your meetings, transcribed
        </span>
        <span className="text-center text-[40px] leading-[46px] font-semibold text-raycast-mute sm:text-[56px] sm:leading-[62px] xl:w-[900px] xl:text-[64px] xl:leading-[70px]">
          on your Mac.
        </span>
      </h1>
      <p className="max-w-[600px] text-center text-lg leading-[31px] text-raycast-on-dark-mute xl:w-[600px]">
        Real-time transcripts and summaries in{" "}
        <a
          href="#faq-languages"
          className="relative inline-block font-medium text-raycast-ink transition-opacity hover:opacity-90"
        >
          25 European languages
          <LanguagesUnderline />
        </a>{" "}
        — private on your Mac, ready for Claude.
      </p>
      <div id="download" className="flex flex-col items-center gap-2.5 pt-1">
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <DownloadButton location="hero" className="flex h-11 cursor-pointer items-center justify-center rounded-lg bg-raycast-primary px-6 text-lg leading-6 font-semibold tracking-[0.014em] text-raycast-on-primary disabled:opacity-70">
            Download for Mac
          </DownloadButton>
          <a
            href="#word-by-word"
            className="flex h-11 items-center justify-center rounded-lg border border-raycast-hairline-strong px-6 text-lg leading-6 font-semibold tracking-[0.014em] text-raycast-ink"
          >
            How it works
          </a>
        </div>
        <DownloadSupportNote />
      </div>
    </div>
  );
}
