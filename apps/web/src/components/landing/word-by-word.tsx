"use client";

import { FitStage } from "@/components/site/fit-stage";
import {
  LIVE_SCRIPT,
  SPEAKERS,
  type LiveScriptLine,
  type SpeakerId,
  liveLine,
  settledLines,
} from "@/data/roadmap-cut";
import {
  useLiveTranscript,
  type LiveTranscript,
} from "@/hooks/use-live-transcript";

const CROP_LINES = settledLines.slice(-3);

const LIVE_LINE: LiveScriptLine =
  LIVE_SCRIPT.find((line) => line.at === 38) ?? {
    at: 38,
    speaker: liveLine.speaker,
    text: liveLine.text,
  };

const WORD_BY_WORD_SCRIPT: readonly LiveScriptLine[] = [LIVE_LINE];

// Static state shown on the server and for reduced motion: mid-sentence at 0:38.
const STATIC_STATE: LiveTranscript = {
  done: [],
  active: {
    line: LIVE_LINE,
    words: 6,
    total: LIVE_LINE.text.split(" ").length,
  },
  fading: false,
};

export function WordByWord() {
  const { active, fading } = useLiveTranscript(
    WORD_BY_WORD_SCRIPT,
    STATIC_STATE,
    { holdMs: 2200, fadeMs: 500 },
  );
  const words = active
    ? active.line.text.split(" ").slice(0, active.words)
    : LIVE_LINE.text.split(" ");

  return (
    <section
      id="word-by-word"
      className="flex w-full flex-col gap-8 px-5 py-14 sm:px-8 md:py-16 xl:flex-row xl:items-center xl:justify-center xl:gap-12 xl:px-[162px] xl:py-0"
    >
      <div className="flex w-full max-w-[480px] shrink-0 flex-col justify-center gap-4 xl:w-[374px]">
        <div className="flex h-5 shrink-0 items-center self-start rounded border border-raycast-accent-red/35 bg-raycast-accent-red-soft px-2">
          <span className="text-[11px] leading-[11px] font-medium tracking-[0.4px] text-raycast-accent-red">
            Real-time transcription
          </span>
        </div>
        <h2 className="flex flex-col xl:w-[374px]">
          <span className="section-title font-semibold tracking-[0.2px] text-raycast-ink">
            Words appear
          </span>
          <span className="section-title font-semibold tracking-[0.2px] text-raycast-mute">
            in real-time
          </span>
        </h2>
        <p className="max-w-[410px] text-[15px] leading-[25px] text-raycast-body xl:w-[340px]">
          Watch the transcript stream live as people speak — no waiting for
          pauses or for the call to end. Your audio never leaves your Mac.
        </p>
        <div className="flex h-6 shrink-0 items-center gap-1.5 self-start rounded-sm border border-raycast-hairline-strong px-2">
          <span className="size-[5px] shrink-0 rounded-full bg-raycast-accent-red" />
          <span className="text-xs leading-3 font-medium tracking-[0.1px] text-raycast-on-dark-mute">
            Transcription model runs on your Mac
          </span>
        </div>
      </div>

      <div className="w-full max-w-[698px] xl:w-[698px] xl:shrink-0">
      <FitStage width={820}>
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
          <div className="flex w-[780px] items-start gap-3" aria-live="off">
            <span className="w-10 shrink-0 text-sm leading-6 text-dark-text-muted tabular-nums">
              {liveLine.time}
            </span>
            <span
              className={`w-16 shrink-0 text-sm leading-6 font-semibold ${SPEAKERS[liveLine.speaker].className}`}
            >
              {SPEAKERS[liveLine.speaker].name}
            </span>
            <span
              className={`flex flex-wrap items-center gap-x-1.5 transition-opacity duration-500 ${
                fading ? "opacity-0" : "opacity-100"
              }`}
            >
              {words.map((word, i) => {
                const fromEnd = words.length - 1 - i;
                const opacity =
                  fromEnd === 0 ? 1 : Math.max(0.4, 1 - fromEnd * 0.15);
                return (
                  <span
                    key={i}
                    className={`text-md leading-6 ${
                      fromEnd === 0
                        ? "text-raycast-ink"
                        : "text-dark-text-primary"
                    }`}
                    style={{ opacity }}
                  >
                    {word}
                  </span>
                );
              })}
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
      </div>
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
