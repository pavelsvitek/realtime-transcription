import { FitStage } from "@/components/site/fit-stage";
import { MeetingsSummaryWindow } from "@/components/landing/meetings-summary-window";

export function MeetingSummary() {
  return (
    <section
      id="meeting-summary"
      className="flex w-full flex-col gap-8 px-5 py-14 sm:px-8 md:py-16 xl:min-h-[765px] xl:flex-row xl:items-center xl:justify-center xl:gap-12 xl:px-[162px] xl:py-0"
    >
      <div className="flex w-full max-w-[480px] shrink-0 flex-col justify-center gap-4 xl:w-[340px]">
        <div className="flex h-5 shrink-0 items-center self-start rounded border border-raycast-accent-red/35 bg-raycast-accent-red-soft px-2">
          <span className="text-[11px] leading-[11px] font-medium tracking-[0.4px] text-raycast-accent-red">
            After your call
          </span>
        </div>
        <h2 className="flex flex-col xl:w-[340px]">
          <span className="section-title font-semibold tracking-[0.2px] text-raycast-ink">
            Instant summaries
          </span>
          <span className="section-title font-semibold tracking-[0.2px] text-raycast-mute">
            with decisions by speaker
          </span>
        </h2>
        <p className="max-w-[410px] text-[15px] leading-[25px] text-raycast-body xl:w-[324px]">
          When your meeting ends, Amie writes a structured summary with key
          decisions and next steps — keeping every speaker’s name attached so
          you know who owns what.
        </p>
        <div className="flex h-6 shrink-0 items-center gap-1.5 self-start rounded-sm border border-raycast-hairline-strong px-2">
          <span className="size-[5px] shrink-0 rounded-full bg-raycast-accent-red" />
          <span className="text-xs leading-3 font-medium tracking-[0.1px] text-raycast-on-dark-mute">
            Generated automatically
          </span>
        </div>
      </div>

      <div className="w-full max-w-[728px] xl:w-[728px] xl:shrink-0">
        <FitStage width={1040} height={680}>
          <MeetingsSummaryWindow />
        </FitStage>
      </div>
    </section>
  );
}
