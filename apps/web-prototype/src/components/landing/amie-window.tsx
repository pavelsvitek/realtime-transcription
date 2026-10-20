import {
  AmieSidebar,
  AmieWindowFrame,
} from "@/components/landing/amie-chrome";
import {
  LIVE_WORDS,
  MEETING,
  SPEAKERS,
  liveLine,
  settledLines,
} from "@/data/roadmap-cut";

export function AmieWindow() {
  return (
    <AmieWindowFrame>
      <AmieSidebar active="transcription" listening />
      <div className="flex h-full min-w-0 grow flex-col overflow-hidden bg-dark-surface-chrome">
        <div className="h-12 w-full shrink-0" />
        <div className="flex min-h-0 grow flex-col overflow-hidden rounded-tl-[12px] bg-dark-surface-content">
          <div className="flex w-full shrink-0 items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs leading-4 text-dark-text-primary">
                {MEETING.title}
              </span>
              <span className="rounded-lg bg-dark-surface-muted px-2 py-0.5 text-[11px] leading-[14px] text-dark-text-muted">
                nemotron-speech-streaming-en-0.6b
              </span>
            </div>
            <div className="flex items-center gap-2">
              <SelectChip label="ASR" value="Local (Nemotron)" />
              <SelectChip label="Input" value="Mic + system" />
              <span className="flex items-center p-0.5">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 10v2a7 7 0 0 1-14 0v-2"
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="12"
                    x2="12"
                    y1="19"
                    y2="22"
                    stroke="#EF4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="flex items-center justify-center rounded-sm bg-[#EF4444] px-4 py-1.5 text-sm leading-4 font-medium text-white">
                Stop
              </span>
            </div>
          </div>

          <div className="flex w-full shrink-0 px-4">
            <div className="flex w-full gap-5 border-b border-dark-border">
              <span className="pt-2 pb-2.5 text-base leading-[18px] text-dark-text-muted">
                Summary
              </span>
              <span className="pt-2 pb-2.5 text-base leading-[18px] text-dark-text-muted">
                Context
              </span>
              <span className="pt-2 pb-2.5 text-base leading-[18px] font-semibold text-dark-text-primary shadow-[inset_0_-2px_0_var(--color-dark-primary)]">
                Transcript (live)
              </span>
            </div>
          </div>

          <div className="flex min-h-0 w-full grow flex-col gap-2 overflow-hidden p-4">
            {settledLines.map((line) => {
              const speaker = SPEAKERS[line.speaker];
              return (
                <div
                  key={line.time + line.text}
                  className="flex w-full items-baseline gap-2"
                >
                  <span className="w-9 shrink-0 text-xs leading-4 text-dark-text-muted tabular-nums">
                    {line.time}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-sm leading-4 font-semibold ${speaker.className}`}
                  >
                    {speaker.name}
                  </span>
                  <span className="text-base leading-[160%] text-dark-text-primary">
                    {line.text}
                  </span>
                </div>
              );
            })}
            <div className="flex w-full items-baseline gap-2">
              <span className="w-9 shrink-0 text-xs leading-4 text-dark-text-muted tabular-nums">
                {liveLine.time}
              </span>
              <span
                className={`w-16 shrink-0 text-sm leading-4 font-semibold ${SPEAKERS[liveLine.speaker].className}`}
              >
                {SPEAKERS[liveLine.speaker].name}
              </span>
              <span className="flex items-center gap-0.5 text-base leading-[160%] text-dark-text-muted">
                {LIVE_WORDS.map((item) => item.word).join(" ")}
                <span className="caret-blink ml-px inline-block h-3.5 w-0.5 shrink-0 bg-dark-text-muted" />
              </span>
            </div>
          </div>

          <div className="flex w-full shrink-0 items-center border-t border-dark-border px-4 py-2">
            <span className="text-xs leading-4 text-dark-text-muted">
              Capturing mic + system audio...
            </span>
          </div>
        </div>
      </div>
    </AmieWindowFrame>
  );
}

function SelectChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs leading-4 text-dark-text-secondary">{label}</span>
      <span className="flex items-center gap-1.5 rounded-sm border border-dark-border-input bg-dark-surface-input px-2 py-[5px]">
        <span className="text-xs leading-4 text-dark-text-primary">{value}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 3.5L5 6.5L8 3.5"
            fill="none"
            stroke="var(--color-dark-text-muted)"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
