import {
  DownloadButton,
  DownloadSupportNote,
} from "@/components/site/download-button";

/** A bot head with a slash: Amie listens on your Mac, nothing joins the call. */
function NoBotIcon() {
  return (
    <svg
      width="13"
      height="13"
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
      className="pointer-events-none absolute -right-0.5 -bottom-[5px] -left-0.5 h-[10px] w-[calc(100%+4px)]"
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
    <svg width="12" height="12" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <path
        d="M12 2C12.4 5.2 13.4 7.2 15.5 9.3C17.6 11.4 19.6 12.4 22.8 12.8C19.6 13.2 17.6 14.2 15.5 16.3C13.4 18.4 12.4 20.4 12 23.6C11.6 20.4 10.6 18.4 8.5 16.3C6.4 14.2 4.4 13.2 1.2 12.8C4.4 12.4 6.4 11.4 8.5 9.3C10.6 7.2 11.6 5.2 12 2Z"
        fill="#D97757"
      />
    </svg>
  );
}

export function Hero() {
  return (
    <div className="relative z-10 flex flex-col items-center gap-[11px] px-5 pt-[50px] sm:pt-[72px] md:pt-[92px] xl:px-0 xl:pt-[106px]">
      <div className="flex flex-wrap items-center justify-center gap-[7px]">
        <div className="flex items-center gap-[5px] rounded px-[7px] py-0.5 bg-raycast-accent-red-soft">
          <span className="size-[5px] shrink-0 rounded-full bg-raycast-accent-red" />
          <span className="text-[11px] leading-[16px] font-medium tracking-[0.033em] text-raycast-accent-red">
            Real-time · Runs on your Mac
          </span>
        </div>
        <div className="flex items-center gap-[5px] rounded border border-raycast-hairline-strong px-[7px] py-0.5">
          <NoBotIcon />
          <span className="text-[11px] leading-[16px] font-medium tracking-[0.033em] text-raycast-on-dark-mute">
            No bot joins your call
          </span>
        </div>
        <a
          href="#local-mcp"
          className="flex items-center gap-[5px] rounded border border-[#D97757]/40 bg-[#D97757]/16 px-[9px] py-0.5 transition-colors hover:border-[#D97757]/65"
        >
          <ClaudeStarIcon />
          <span className="text-[11px] leading-[16px] font-medium tracking-[0.033em] text-[#F0B496]">
            Works with Claude
          </span>
        </a>
      </div>
      <h1 className="flex flex-col items-center">
        <span className="max-w-[810px] text-center text-[36px] leading-[41px] font-semibold text-raycast-ink sm:text-[50px] sm:leading-[56px] xl:w-[810px] xl:text-[58px] xl:leading-[63px]">
          Your meetings, transcribed
        </span>
        <span className="text-center text-[36px] leading-[41px] font-semibold text-raycast-mute sm:text-[50px] sm:leading-[56px] xl:w-[810px] xl:text-[58px] xl:leading-[63px]">
          on your Mac.
        </span>
      </h1>
      <p className="max-w-[540px] text-center text-[16px] leading-[28px] text-raycast-on-dark-mute xl:w-[540px]">
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
      <div id="download" className="flex flex-col items-center gap-[9px] pt-[3px]">
        <div className="flex flex-col items-center gap-[11px] sm:flex-row">
          <DownloadButton location="hero" className="flex h-10 cursor-pointer items-center justify-center rounded-[9px] bg-raycast-primary px-[22px] text-[16px] leading-[22px] font-semibold tracking-[0.014em] text-raycast-on-primary disabled:opacity-70">
            Download for Mac
          </DownloadButton>
          <a
            href="#word-by-word"
            className="flex h-10 items-center justify-center rounded-[9px] border border-raycast-hairline-strong px-[22px] text-[16px] leading-[22px] font-semibold tracking-[0.014em] text-raycast-ink"
          >
            How it works
          </a>
        </div>
        <DownloadSupportNote className="text-xs" />
      </div>
    </div>
  );
}
