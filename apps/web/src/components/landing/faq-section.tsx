import type { ReactNode } from "react";
import { DownloadButton } from "@/components/site/download-button";
import { SiteLink as Link } from "@/components/site/site-link";
import { MIN_MACOS_MAJOR } from "@/lib/platform";

type FaqItem = {
  question: string;
  answer: string;
  icon: ReactNode;
};

const SUPPORTED_LANGUAGES = [
  "Bulgarian",
  "Croatian",
  "Czech",
  "Danish",
  "Dutch",
  "English",
  "Estonian",
  "Finnish",
  "French",
  "German",
  "Greek",
  "Hungarian",
  "Italian",
  "Latvian",
  "Lithuanian",
  "Maltese",
  "Polish",
  "Portuguese",
  "Romanian",
  "Russian",
  "Slovak",
  "Slovenian",
  "Spanish",
  "Swedish",
  "Ukrainian",
] as const;

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Does a bot join my call?",
    answer:
      "No. Amie listens directly on your Mac — your microphone and the audio your Mac plays. Nobody else on the call sees an extra participant or bot.",
    icon: (
      <>
        <rect x="4" y="8" width="16" height="12" rx="3" />
        <path d="M12 8V4" />
        <path d="M3 3l18 18" />
      </>
    ),
  },
  {
    question: "Which meeting apps does Amie work with?",
    answer:
      "Any app that plays audio on your Mac — Zoom, Google Meet, Microsoft Teams, Slack, FaceTime, Discord, or browser calls. Zoom, Teams, Meet, and Slack also get automatic speaker labels.",
    icon: (
      <>
        <rect x="2" y="5" width="14" height="14" rx="2" />
        <path d="m16 10 6-3v10l-6-3" />
      </>
    ),
  },
  {
    question: "Do I need an account or an API key?",
    answer:
      "No account is needed, and live transcription runs right on your Mac with no API key. For automatic AI summaries, add your own OpenAI, Google Gemini, or xAI key in Settings.",
    icon: (
      <>
        <circle cx="7.5" cy="15.5" r="5.5" />
        <path d="m21 2-9.6 9.6" />
        <path d="m15.5 7.5 3 3L22 7l-3-3" />
      </>
    ),
  },
  {
    question: "Where are my meetings and audio stored?",
    answer:
      "Everything stays in a local database on your Mac — we never upload or keep a copy. Amie transcribes audio in real time and doesn’t save recordings, so only text is kept.",
    icon: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
  },
  {
    question: "How does speaker detection work without a bot?",
    answer:
      "For Zoom, Teams, and Slack, Amie reads who is speaking from the meeting window via macOS Accessibility. For Google Meet, our Chrome/Brave extension sends names directly to Amie on your Mac.",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  {
    question: "How can I use my meetings in Claude, Codex, or Cursor?",
    answer:
      "Amie includes a built-in local MCP server that connects to Claude, Cursor, Codex, Grok Bot, or any MCP-compatible AI tool — search past meetings and pull out decisions while everything stays on your Mac.",
    icon: (
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5Z" />
    ),
  },
];

function FaqIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-raycast-accent-blue-soft text-raycast-accent-blue">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </span>
  );
}

export function FaqSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 pt-16 sm:px-8 md:gap-12 md:pt-24 xl:px-[162px] xl:pt-28"
    >
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div className="flex flex-col gap-3.5">
          <div className="flex h-5 shrink-0 items-center self-start rounded border border-raycast-accent-blue/35 bg-raycast-accent-blue-soft px-2">
            <span className="text-[11px] leading-[11px] font-medium tracking-[0.4px] text-raycast-accent-blue">
              FAQ
            </span>
          </div>
          <h2
            id="faq-heading"
            className="section-title flex flex-wrap gap-x-3 font-semibold tracking-tight"
          >
            <span className="text-raycast-ink">Frequently asked</span>
            <span className="text-raycast-mute">questions</span>
          </h2>
        </div>

        <Link
          href="/support"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-md border border-raycast-hairline-strong bg-raycast-surface px-3.5 text-sm font-medium text-raycast-ink transition-colors hover:border-white/28 hover:bg-raycast-surface-elevated"
        >
          <span>Visit Support</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-raycast-mute"
            aria-hidden
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      </div>

      <div className="flex flex-col gap-3.5 md:gap-4">
        {/* Q1 highlighted opener */}
        <article className="flex flex-col items-start justify-between gap-4 rounded-[12px] border border-raycast-accent-blue/30 bg-[#101419] p-4 sm:p-6 md:flex-row md:items-center md:gap-7 md:px-7">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <FaqIcon>
                <path d="M20 6 9 17l-5-5" />
              </FaqIcon>
              <h3 className="text-[15px] leading-5 font-semibold text-raycast-ink sm:text-[16px]">
                Is it really free?
              </h3>
            </div>
            <p className="text-base leading-[21px] text-[#C4C7CE]">
              Yes, the app works offline with an AI model from NVIDIA. You don’t
              have to pay anything and there is no subscription.
            </p>
          </div>
          <DownloadButton
            location="faq"
            className="flex h-[38px] w-full shrink-0 cursor-pointer items-center justify-center rounded-md bg-raycast-primary px-4 text-base font-semibold text-raycast-on-primary transition-colors hover:bg-primary-hover disabled:opacity-70 sm:w-auto"
          >
            Download for Mac
          </DownloadButton>
        </article>

        {/* Core 6 questions: 1 column on mobile, 2 columns on tablet/desktop */}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:gap-4">
          {FAQ_ITEMS.map((item) => (
            <article
              key={item.question}
              className="flex flex-col gap-2.5 rounded-[12px] border border-raycast-hairline-soft bg-raycast-surface p-4 sm:p-6"
            >
              <div className="flex items-start gap-2.5 sm:items-center">
                <FaqIcon>{item.icon}</FaqIcon>
                <h3 className="pt-0.5 text-[14px] leading-5 font-semibold text-raycast-ink sm:pt-0 sm:text-[15px]">
                  {item.question}
                </h3>
              </div>
              <p className="text-base leading-[21px] text-[#B4B4B8]">{item.answer}</p>
            </article>
          ))}
        </div>

        {/* Supported languages card (full-width for scannable 25-language list) */}
        <article
          id="faq-languages"
          className="scroll-mt-20 flex flex-col gap-3.5 rounded-[12px] border border-raycast-hairline-soft bg-raycast-surface p-4 sm:p-6 md:px-7"
        >
          <div className="flex flex-col items-start justify-between gap-2.5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <FaqIcon>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </FaqIcon>
              <h3 className="text-[14px] leading-5 font-semibold text-raycast-ink sm:text-[15px]">
                Which languages are supported?
              </h3>
            </div>
            <span className="inline-flex h-[26px] shrink-0 items-center rounded-md border border-[#6FB0DE]/25 bg-[#6FB0DE]/10 px-2.5 text-[11px] font-medium text-[#BFE0F5]">
              Auto-detected · {SUPPORTED_LANGUAGES.length} languages
            </span>
          </div>
          <p className="text-base leading-[21px] text-[#B4B4B8]">
            Amie automatically detects and transcribes{" "}
            {SUPPORTED_LANGUAGES.length} European languages right on your Mac —
            no manual switching required:
          </p>
          <ul
            aria-label="Supported languages"
            className="flex flex-wrap gap-1.5"
          >
            {SUPPORTED_LANGUAGES.map((language) => (
              <li
                key={language}
                className="rounded-sm border border-white/8 bg-white/[0.04] px-2 py-0.5 text-xs leading-4 font-medium text-[#D4D4D8]"
              >
                {language}
              </li>
            ))}
          </ul>
        </article>

        {/* Final requirements card */}
        <article className="flex flex-col items-start justify-between gap-3.5 rounded-[12px] border border-raycast-hairline-soft bg-raycast-surface p-4 sm:p-6 md:flex-row md:items-center md:gap-7 md:px-7">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h3 className="text-[14px] leading-5 font-semibold text-raycast-ink sm:text-[15px]">
              What Mac do I need?
            </h3>
            <p className="text-base leading-[21px] text-[#B4B4B8]">
              Amie requires macOS {MIN_MACOS_MAJOR} (Sequoia) or later on an
              Apple Silicon Mac (M1 or newer). The transcription model downloads
              automatically the first time you open the app.
            </p>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center rounded-md border border-white/12 bg-white/5 px-3 text-xs font-medium text-raycast-body">
            macOS {MIN_MACOS_MAJOR}+ · Apple Silicon
          </span>
        </article>
      </div>
    </section>
  );
}
