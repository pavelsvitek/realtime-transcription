import type { ReactNode } from "react";

import { Footer } from "@/components/site/footer";
import { PrimaryNav } from "@/components/site/primary-nav";
import { SUPPORT_EMAIL } from "@/lib/site";

export type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  intro: ReactNode;
  sections: LegalSection[];
};

/** Unfilled legal fact. Rendered visibly so it can't ship by accident. */
export function Placeholder({ children }: { children: string }) {
  return <mark className="legal-placeholder">[{children}]</mark>;
}

export function SupportEmail() {
  return <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
}

export function LegalPage({
  eyebrow,
  title,
  lastUpdated,
  intro,
  sections,
}: LegalPageProps) {
  return (
    <main id="top" className="min-h-screen bg-raycast-canvas text-raycast-ink">
      <div className="relative isolate mx-auto w-full max-w-[1440px]">
        <PrimaryNav />

        <div className="mx-auto w-full max-w-[1120px] px-4 pt-16 sm:px-8 md:pt-24">
          <header className="max-w-[720px]">
            <p className="text-xs font-medium tracking-[0.08em] text-brand-accent uppercase">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-raycast-ink md:text-4xl">
              {title}
            </h1>
            <p className="mt-4 text-sm text-raycast-mute">
              Last updated <time>{lastUpdated}</time>
            </p>
            <div className="legal-prose mt-8">{intro}</div>
          </header>

          <div className="mt-14 grid gap-12 border-t border-raycast-hairline-soft pt-12 lg:grid-cols-[220px_minmax(0,720px)] lg:gap-16">
            <nav aria-label="On this page" className="lg:sticky lg:top-8 lg:self-start">
              <p className="text-xs tracking-[0.08em] text-raycast-mute uppercase">
                On this page
              </p>
              <ol className="mt-4 flex flex-col gap-2.5 text-sm">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="flex gap-2 text-raycast-body transition-colors hover:text-raycast-ink"
                    >
                      <span className="w-5 shrink-0 text-raycast-mute tabular-nums">
                        {index + 1}.
                      </span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <article className="legal-prose">
              {sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  aria-labelledby={`${section.id}-title`}
                >
                  <h2 id={`${section.id}-title`}>
                    <span className="legal-num">{index + 1}.</span>
                    {section.title}
                  </h2>
                  {section.body}
                </section>
              ))}
            </article>
          </div>
        </div>

        <Footer />
      </div>
    </main>
  );
}
