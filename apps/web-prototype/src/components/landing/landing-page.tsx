import { AmieWindow } from "@/components/landing/amie-window";
import { Hero } from "@/components/landing/hero";
import { McpSection } from "@/components/landing/mcp-section";
import { PrimaryNav } from "@/components/landing/primary-nav";
import { StripeWaveform } from "@/components/landing/stripe-waveform";
import { WordByWord } from "@/components/landing/word-by-word";

export function LandingPage() {
  return (
    <main id="top" className="min-h-screen bg-raycast-canvas text-raycast-ink">
      <div className="relative mx-auto w-full max-w-[1440px] overflow-x-clip">
        <section className="relative h-[1256px]">
          <PrimaryNav />
          <Hero />
          <StripeWaveform />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[860px] h-[280px]"
            style={{
              backgroundImage:
                "linear-gradient(in oklab 180deg, oklab(13.4% -.0007 -0.005 / 0%) 0%, var(--color-raycast-canvas) 100%)",
            }}
          />
          <div className="absolute top-[512px] left-[200px] z-10">
            <AmieWindow />
          </div>
        </section>
        <WordByWord />
        <McpSection />
      </div>
    </main>
  );
}
