import { AmieWindow } from "@/components/landing/amie-window";
import { FitStage } from "@/components/site/fit-stage";
import { Footer } from "@/components/site/footer";
import { GridBackground } from "@/components/landing/grid-background";
import { Hero } from "@/components/landing/hero";
import { McpSection } from "@/components/landing/mcp-section";
import { MeetingSummary } from "@/components/landing/meeting-summary";
import { PrimaryNav } from "@/components/site/primary-nav";
import { SpeakerId } from "@/components/landing/speaker-id";
import { StripeWaveform } from "@/components/landing/stripe-waveform";
import { WordByWord } from "@/components/landing/word-by-word";
import { WorksWith } from "@/components/landing/works-with";

/**
 * Layout for wide screens: the design is 1440px wide. On wider screens everything
 * is scaled with CSS `zoom` (see `--page-zoom` in globals.css), while backdrops,
 * the nav hairline and the footer run edge to edge. The pinned Local MCP scene is
 * viewport-height based, so it sits outside the zoom and scales itself.
 */
export function LandingPage() {
  return (
    <main id="top" className="min-h-screen bg-raycast-canvas text-raycast-ink">
      <div className="page-zoom relative isolate overflow-x-clip">
        <GridBackground />
        <section className="relative overflow-x-clip pb-20 xl:h-[1256px] xl:pb-0">
          <StripeWaveform />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[160px] xl:top-[860px] xl:bottom-auto xl:h-[280px]"
            style={{
              backgroundImage:
                "linear-gradient(in oklab 180deg, oklab(13.4% -.0007 -0.005 / 0%) 0%, var(--color-raycast-canvas) 100%)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 top-[55px] z-20 h-px bg-raycast-hairline-soft"
          />
          <div className="relative mx-auto w-full xl:h-full xl:w-[1440px]">
            <PrimaryNav />
            <Hero />
            <WorksWith />
            <div className="relative z-10 mx-auto mt-10 w-full px-4 sm:px-8 xl:absolute xl:top-[512px] xl:left-[200px] xl:mx-0 xl:mt-0 xl:w-[1040px] xl:p-0">
              <FitStage width={1040} height={680}>
                <AmieWindow />
              </FitStage>
            </div>
          </div>
        </section>
        <div className="mx-auto w-full max-w-[1440px]">
          <WordByWord />
          <SpeakerId />
          <MeetingSummary />
        </div>
      </div>
      <McpSection />
      <div className="page-zoom">
        <Footer />
      </div>
    </main>
  );
}
