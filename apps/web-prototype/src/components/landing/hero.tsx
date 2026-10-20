export function Hero() {
  return (
    <div className="relative z-10 flex flex-col items-center gap-[22px] pt-16">
      <div className="flex items-center gap-1.5 rounded px-2 py-0.5 bg-raycast-accent-red-soft">
        <span className="size-1.5 shrink-0 rounded-full bg-raycast-accent-red" />
        <span className="text-xs leading-[18px] font-medium tracking-[0.033em] text-raycast-accent-red">
          Live · on device
        </span>
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
      <div id="download" className="flex items-center gap-3 pt-1">
        <a
          href="#download"
          className="flex h-9 items-center justify-center rounded-md bg-raycast-primary px-4 text-base leading-[22px] font-semibold tracking-[0.014em] text-raycast-on-primary"
        >
          Download for Mac
        </a>
        <a
          href="#word-by-word"
          className="flex h-9 items-center justify-center rounded-md border border-raycast-hairline-strong px-4 text-base leading-[22px] font-semibold tracking-[0.014em] text-raycast-ink"
        >
          How it works
        </a>
      </div>
    </div>
  );
}
