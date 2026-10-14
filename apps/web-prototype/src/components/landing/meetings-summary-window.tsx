import type { ReactNode } from "react";
import { AmieSidebar, AmieWindowFrame } from "@/components/landing/amie-chrome";
import {
  SPEAKERS,
  SUMMARY,
  type SpeakerId,
  type SummaryInline,
} from "@/data/roadmap-cut";

function SpeakerName({ id }: { id: SpeakerId }) {
  const speaker = SPEAKERS[id];
  return (
    <span className={`font-semibold ${speaker.className}`}>{speaker.name}</span>
  );
}

function Inline({ thesis, speaker, text }: SummaryInline) {
  return (
    <span className="inline">
      {thesis ? (
        <span className="font-semibold text-dark-text-primary">{thesis} </span>
      ) : null}
      {speaker ? (
        <>
          <SpeakerName id={speaker} />{" "}
        </>
      ) : null}
      <span className="text-dark-text-primary">{text}</span>
    </span>
  );
}

function Bullet({
  indent,
  children,
}: {
  indent?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 ${indent ? "pl-[18px]" : ""}`}
    >
      <span className="shrink-0 text-base leading-[22px] text-dark-text-primary">
        •
      </span>
      <p className="min-w-0 text-base leading-[22px]">{children}</p>
    </div>
  );
}

function OverflowMenu() {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-dark-border bg-dark-surface-content">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="6" r="1.4" fill="var(--color-dark-text-secondary)" />
        <circle
          cx="12"
          cy="12"
          r="1.4"
          fill="var(--color-dark-text-secondary)"
        />
        <circle
          cx="12"
          cy="18"
          r="1.4"
          fill="var(--color-dark-text-secondary)"
        />
      </svg>
    </div>
  );
}

export function MeetingsSummaryWindow() {
  return (
    <AmieWindowFrame>
      <AmieSidebar active="meetings" />
      <div className="flex h-full min-w-0 grow flex-col overflow-hidden bg-dark-surface-chrome">
        <div className="h-12 w-full shrink-0" />
        <div className="flex min-h-0 grow flex-col overflow-hidden rounded-tl-[12px] bg-dark-surface-content">
          <div className="flex w-full shrink-0 items-center justify-between py-3 pr-6 pl-4">
            <span className="text-xs leading-4 text-dark-text-secondary">
              Meetings
            </span>
            <OverflowMenu />
          </div>

          <div className="flex min-h-0 w-full grow flex-col overflow-hidden px-8 pt-2 pb-10">
            <p className="text-sm leading-4 text-dark-text-secondary">
              {SUMMARY.when}
            </p>
            <h3 className="pt-1.5 pb-5 text-[28px] leading-[35px] font-semibold tracking-tight text-dark-text-primary">
              {SUMMARY.title}
            </h3>

            <div className="flex w-full shrink-0 gap-5 border-b border-dark-border">
              <span className="pt-2 pb-2.5 text-base leading-[18px] font-semibold text-dark-text-primary shadow-[inset_0_-2px_0_var(--color-dark-primary)]">
                Summary
              </span>
              <span className="pt-2 pb-2.5 text-base leading-[18px] text-dark-text-muted">
                Context
              </span>
              <span className="pt-2 pb-2.5 text-base leading-[18px] text-dark-text-muted">
                Transcript
              </span>
            </div>

            <div className="flex items-center gap-2.5 pt-5 pb-[18px]">
              <span className="text-sm leading-4 text-dark-text-secondary">
                Regenerate
              </span>
              <span className="text-sm leading-4 text-dark-text-secondary">
                Copy summary
              </span>
            </div>

            <div className="flex w-[720px] max-w-full flex-col gap-3">
              <h4 className="text-base leading-[22px] font-semibold text-dark-text-primary">
                Executive Summary
              </h4>
              <ul className="flex list-none flex-col gap-3 pl-[18px]">
                {SUMMARY.executive.map((item) => (
                  <li key={item.thesis}>
                    <Bullet>
                      <Inline
                        thesis={item.thesis}
                        speaker={item.speaker}
                        text={item.text}
                      />
                    </Bullet>
                  </li>
                ))}
              </ul>

              <h4 className="pt-4 text-base leading-[22px] font-semibold text-dark-text-primary">
                Full Summary
              </h4>
              {SUMMARY.full.map((section) => (
                <div key={section.heading} className="flex flex-col">
                  <h5 className="pt-2.5 text-base leading-5 font-semibold text-dark-text-primary">
                    {section.heading}
                  </h5>
                  <ul className="flex list-none flex-col gap-2 pt-2.5 pl-[18px]">
                    {section.items.map((item) => (
                      <li key={`${section.heading}-${item.text}`}>
                        <Bullet>
                          <Inline speaker={item.speaker} text={item.text} />
                        </Bullet>
                        {item.children?.map((child) => (
                          <Bullet
                            key={child.text}
                            indent
                          >
                            <Inline
                              speaker={child.speaker}
                              text={child.text}
                            />
                          </Bullet>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AmieWindowFrame>
  );
}
