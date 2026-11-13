import { FitStage } from "@/components/site/fit-stage";
import {
  LIVE_WORDS,
  SPEAKERS,
  type SpeakerId,
  liveLine,
  settledLines,
} from "@/data/roadmap-cut";

const CROP_LINES = settledLines.slice(-3);

export function WordByWord() {
  return (
    <section
      id="word-by-word"
      className="flex w-full flex-col gap-10 px-5 py-16 sm:px-8 md:py-20 xl:flex-row xl:items-center xl:gap-16 xl:px-16 xl:py-0"
    >
      <div className="flex w-full max-w-[560px] shrink-0 flex-col justify-center gap-5 xl:w-[440px]">
        <div className="flex h-6 shrink-0 items-center self-start rounded border border-raycast-accent-red/35 bg-raycast-accent-red-soft px-2.5">
          <span className="text-xs leading-3 font-medium tracking-[0.4px] text-raycast-accent-red">
            On device
          </span>
        </div>
        <h2 className="flex flex-col xl:w-[440px]">
          <span className="section-title font-semibold tracking-[0.2px] text-raycast-ink">
            Every word,
          </span>
          <span className="section-title font-semibold tracking-[0.2px] text-raycast-mute">
            as it’s said.
          </span>
        </h2>
        <p className="max-w-[480px] text-lg text-raycast-body xl:w-[400px]">
          Amie writes on your Mac as you talk. Local by default — you see the
          words land, not a paragraph after the pause.
        </p>
        <div className="flex h-7 shrink-0 items-center gap-2 self-start rounded-sm border border-raycast-hairline-strong px-2.5">
          <span className="size-1.5 shrink-0 rounded-full bg-raycast-accent-red" />
          <span className="text-sm leading-[13px] font-medium tracking-[0.1px] text-raycast-on-dark-mute">
            Local (Nemotron)
          </span>
        </div>
      </div>

      <FitStage width={820} className="xl:w-[820px] xl:shrink-0">
      <div className="pointer-events-none flex h-fit w-[820px] shrink-0 flex-col overflow-hidden rounded-lg bg-raycast-surface select-none shadow-[0_0_0_1px_#FFFFFF29,0_32px_80px_#0000008C]">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-raycast-hairline-soft px-5">
          <div className="flex h-[52px] items-center gap-5">
            <span className="text-sm leading-[13px] font-medium text-raycast-mute">
              Summary
            </span>
            <span className="text-sm leading-[13px] font-medium text-raycast-mute">
              Context
            </span>
            <span className="flex h-[52px] flex-col justify-center border-b-2 border-dark-primary">
              <span className="text-sm leading-[13px] font-semibold text-raycast-ink">
                Transcript (live)
              </span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-4 px-5 py-4">
          {CROP_LINES.map((line) => (
            <CropLine
              key={line.time}
              time={line.time}
              speaker={line.speaker}
              muted={line.speaker !== "sam"}
              text={line.text}
            />
          ))}
          <div className="flex w-[780px] items-start gap-3">
            <span className="w-10 shrink-0 text-sm leading-6 text-dark-text-muted">
              {liveLine.time}
            </span>
            <span
              className={`w-16 shrink-0 text-sm leading-6 font-semibold ${SPEAKERS[liveLine.speaker].className}`}
            >
              {SPEAKERS[liveLine.speaker].name}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {LIVE_WORDS.map((item) => (
                <span
                  key={item.word}
                  className={`text-md leading-6 ${
                    item.ink ? "text-raycast-ink" : "text-dark-text-primary"
                  }`}
                  style={{ opacity: item.opacity }}
                >
                  {item.word}
                </span>
              ))}
              <span className="caret-blink h-4 w-0.5 shrink-0 rounded-[1px] bg-raycast-accent-red" />
            </span>
          </div>
        </div>

        <div className="mt-auto flex h-11 shrink-0 items-center border-t border-raycast-hairline-soft px-5">
          <span className="text-xs leading-3 text-dark-text-muted">
            Capturing mic + system audio…
          </span>
        </div>
      </div>
      </FitStage>
    </section>
  );
}

function CropLine({
  time,
  speaker,
  text,
  muted,
}: {
  time: string;
  speaker: SpeakerId;
  text: string;
  muted?: boolean;
}) {
  const meta = SPEAKERS[speaker];
  return (
    <div className="flex w-[780px] items-start gap-3">
      <span className="w-10 shrink-0 text-sm leading-[22px] text-dark-text-muted">
        {time}
      </span>
      <span
        className={`w-16 shrink-0 text-sm leading-[22px] font-semibold ${meta.className}`}
      >
        {meta.name}
      </span>
      <span
        className={`text-md leading-[22px] ${
          muted ? "text-dark-text-secondary" : "text-dark-text-primary"
        }`}
      >
        {text}
      </span>
    </div>
  );
}
