import { MeetingsSummaryWindow } from "@/components/landing/meetings-summary-window";

export function MeetingSummary() {
  return (
    <section
      id="meeting-summary"
      className="flex min-h-[900px] w-full items-center gap-14 px-16"
    >
      <div className="flex w-[400px] shrink-0 flex-col justify-center gap-5">
        <div className="flex h-6 shrink-0 items-center self-start rounded border border-raycast-accent-red/35 bg-raycast-accent-red-soft px-2.5">
          <span className="text-xs leading-3 font-medium tracking-[0.4px] text-raycast-accent-red">
            Meeting summary
          </span>
        </div>
        <h2 className="flex w-[400px] flex-col">
          <span className="text-4xl font-semibold tracking-[0.2px] text-raycast-ink">
            Who said it,
          </span>
          <span className="text-4xl font-semibold tracking-[0.2px] text-raycast-mute">
            in the summary.
          </span>
        </h2>
        <p className="w-[380px] text-lg text-raycast-body">
          The full Amie window after Stop. Meetings detail, Summary tab — names
          stay in the markdown.
        </p>
        <div className="flex h-7 shrink-0 items-center gap-2 self-start rounded-sm border border-raycast-hairline-strong px-2.5">
          <span className="size-1.5 shrink-0 rounded-full bg-raycast-accent-red" />
          <span className="text-sm leading-[13px] font-medium tracking-[0.1px] text-raycast-on-dark-mute">
            After Stop
          </span>
        </div>
      </div>

      <div className="summary-stage">
        <div className="summary-stage-inner">
          <MeetingsSummaryWindow />
        </div>
      </div>
    </section>
  );
}
