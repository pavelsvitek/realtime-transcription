function ClaudeStar({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      aria-hidden
    >
      <path
        d="M12 2C12.4 5.2 13.4 7.2 15.5 9.3C17.6 11.4 19.6 12.4 22.8 12.8C19.6 13.2 17.6 14.2 15.5 16.3C13.4 18.4 12.4 20.4 12 23.6C11.6 20.4 10.6 18.4 8.5 16.3C6.4 14.2 4.4 13.2 1.2 12.8C4.4 12.4 6.4 11.4 8.5 9.3C10.6 7.2 11.6 5.2 12 2Z"
        fill="#D97757"
      />
    </svg>
  );
}

/** Floating mini Claude card paired with the hero window, kept above the fold on desktop. */
export function HeroClaudeCard() {
  return (
    <a
      href="#local-mcp"
      aria-label="See how Amie connects to Claude on your Mac"
      className="group relative z-20 mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-[400px] flex-col gap-3 rounded-2xl border border-[#D97757]/38 bg-[#1C1B19]/95 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-md transition-colors hover:border-[#D97757]/65 sm:mt-5 xl:absolute xl:top-[636px] xl:right-[68px] xl:mx-0 xl:mt-0 xl:w-[344px]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClaudeStar size={16} />
          <span className="text-sm leading-4 font-semibold text-[#F4F3EE]">
            Ask Claude
          </span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[#D97757]/15 px-2 py-0.5">
          <span className="size-1.5 shrink-0 rounded-full bg-[#D97757]" />
          <span className="text-[11px] leading-[14px] font-medium text-[#E8A07A]">
            Connected on this Mac
          </span>
        </span>
      </div>

      <div className="flex justify-end">
        <div className="rounded-xl bg-[#2E2D2A] px-3 py-2">
          <p className="text-sm leading-[18px] text-[#F4F3EE]">
            What did Maya decide in Sprint planning?
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <span className="pt-0.5">
          <ClaudeStar size={14} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm leading-[19px] text-[#F4F3EE]">
            Maya agreed to keep transcription local if latency stays low.
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-[20px] items-center rounded bg-[#3A2A22] px-2 text-[11px] leading-[14px] font-medium text-[#E8A07A]">
              From Amie · 0:31
            </span>
            <span className="text-[11px] leading-[14px] text-[#A8A59C]">
              No cloud upload
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
