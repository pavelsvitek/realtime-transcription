import { HeroWave } from "../HeroWave";
import { ArrowRight, Icon, PrimaryButton } from "./ui";

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <section className="flex flex-col items-center text-center" aria-labelledby="wizard-title">
      <HeroWave />
      <h1
        id="wizard-title"
        className="mt-7 max-w-[720px] text-[46px] leading-[52px] font-[650] tracking-[-0.03em] text-text-primary"
      >
        Amie listens to your calls and keeps notes for you.
      </h1>
      <p className="mt-3.5 max-w-[560px] text-[16px] leading-6 text-text-secondary">
        Live transcript while you talk. A clean summary when you hang up. Everything is
        transcribed on this Mac.
      </p>
      <PrimaryButton
        className="mt-[30px] h-[54px] rounded-xl px-[30px] text-[16px] leading-5 font-[650]"
        onClick={onNext}
      >
        Get started
        <ArrowRight size={17} />
      </PrimaryButton>
      <p className="mt-[18px] flex items-center gap-1.5 text-[13px] leading-[19px] text-text-muted">
        <Icon size={14}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </Icon>
        Takes about 2 minutes
      </p>
    </section>
  );
}
