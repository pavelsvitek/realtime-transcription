const LIVE_WORDS = [
  { word: "Sure,", opacity: 0.4 },
  { word: "median", opacity: 0.55 },
  { word: "was", opacity: 0.7 },
  { word: "around", opacity: 0.85 },
  { word: "two", opacity: 1 },
  { word: "hundr", opacity: 1, ink: true },
];

export function WordByWord() {
  return (
    <section
      id="word-by-word"
      className="flex w-full items-center gap-16 px-16"
    >
      <div className="flex w-[440px] shrink-0 flex-col justify-center gap-5">
        <div className="flex h-6 shrink-0 items-center self-start rounded border border-raycast-accent-red/35 bg-raycast-accent-red-soft px-2.5">
          <span className="text-xs leading-3 font-medium tracking-[0.4px] text-raycast-accent-red">
            On device
          </span>
        </div>
        <h2 className="flex w-[440px] flex-col">
          <span className="text-4xl font-semibold tracking-[0.2px] text-raycast-ink">
            Every word,
          </span>
          <span className="text-4xl font-semibold tracking-[0.2px] text-raycast-mute">
            as it’s said.
          </span>
        </h2>
        <p className="w-[400px] text-lg text-raycast-body">
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

      <div className="flex h-fit w-[820px] shrink-0 flex-col overflow-hidden rounded-lg bg-raycast-surface shadow-[0_0_0_1px_#FFFFFF29,0_32px_80px_#0000008C]">
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
          <div className="flex h-7 shrink-0 items-center rounded-sm border border-raycast-hairline-strong px-2.5">
            <span className="text-xs leading-3 font-medium tracking-[0.1px] text-raycast-on-dark-mute">
              ASR: Local (Nemotron)
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-4 px-5 py-4">
          <CropLine
            time="0:08"
            speaker="Alex"
            you={false}
            muted
            text="So for the Q3 roadmap, what are we shipping first?"
          />
          <CropLine
            time="0:15"
            speaker="You"
            you
            text="We should prioritize the offline path — local ASR before cloud fallback."
          />
          <CropLine
            time="0:22"
            speaker="Alex"
            you={false}
            muted
            text="Agreed. Keep speaker tags in the export so summaries stay readable."
          />
          <div className="flex w-[780px] items-start gap-3">
            <span className="w-10 shrink-0 text-sm leading-6 text-dark-text-muted">
              0:38
            </span>
            <span className="w-11 shrink-0 text-sm leading-6 font-semibold text-dark-speaker-user">
              You
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
    </section>
  );
}

function CropLine({
  time,
  speaker,
  you,
  text,
  muted,
}: {
  time: string;
  speaker: string;
  you: boolean;
  text: string;
  muted?: boolean;
}) {
  return (
    <div className="flex w-[780px] items-start gap-3">
      <span className="w-10 shrink-0 text-sm leading-[22px] text-dark-text-muted">
        {time}
      </span>
      <span
        className={`w-11 shrink-0 text-sm leading-[22px] font-semibold ${
          you ? "text-dark-speaker-user" : "text-dark-speaker-remote"
        }`}
      >
        {speaker}
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
