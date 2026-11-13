import { FitStage } from "@/components/site/fit-stage";
import { MeetingsSummaryWindow } from "@/components/landing/meetings-summary-window";

export function MeetingSummary() {
  return (
    <section
      id="meeting-summary"
      className="flex w-full flex-col gap-10 px-5 py-16 sm:px-8 md:py-20 xl:min-h-[900px] xl:flex-row xl:items-center xl:gap-14 xl:px-16 xl:py-0"
    >
      <div className="flex w-full max-w-[560px] shrink-0 flex-col justify-center gap-5 xl:w-[400px]">
        <div className="flex h-6 shrink-0 items-center self-start rounded border border-raycast-accent-red/35 bg-raycast-accent-red-soft px-2.5">
          <span className="text-xs leading-3 font-medium tracking-[0.4px] text-raycast-accent-red">
            Meeting summary
          </span>
        </div>
        <h2 className="flex flex-col xl:w-[400px]">
          <span className="section-title font-semibold tracking-[0.2px] text-raycast-ink">
            Who said it,
          </span>
          <span className="section-title font-semibold tracking-[0.2px] text-raycast-mute">
            in the summary.
          </span>
        </h2>
        <p className="max-w-[480px] text-lg text-raycast-body xl:w-[380px]">
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

      <FitStage width={1040} height={680} className="min-w-0 xl:flex-1">
        <MeetingsSummaryWindow />
      </FitStage>
    </section>
  );
}
