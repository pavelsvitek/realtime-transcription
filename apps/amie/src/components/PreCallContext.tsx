import type { ReactNode } from "react";

const BENEFITS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Names spelled right",
    body: "List who is joining, so Maya never turns into “Maia” in your notes.",
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
    title: "A summary with a point",
    body: "Say what you need, and the summary leads with that outcome.",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
  },
  {
    title: "Agents get the backstory",
    body: "Claude and other MCP apps read this context next to the transcript.",
    icon: (
      <>
        <path d="M12 22v-5" />
        <path d="M9 8V2" />
        <path d="M15 8V2" />
        <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
      </>
    ),
  },
];

/** Why context matters: heading plus three benefit cards. Used before and during a call. */
export function ContextIntro({ live = false }: { live?: boolean }) {
  return (
    <>
      <div>
        <h2 className="text-[20px] font-[650] leading-7 tracking-[-0.01em] text-text-primary">
          {live ? "Brief Amie" : "Brief Amie before the call"}
        </h2>
        <p className="mt-1 max-w-[560px] text-[13px] leading-[1.45] text-text-secondary">
          {live
            ? "Context added now still shapes the summary. Add who was there and what you came to decide."
            : "Two minutes of context turns a generic recap into a summary that knows who was there and what you came to decide."}
        </p>
      </div>
      <ul className="m-0 grid list-none grid-cols-3 gap-2.5 p-0">
        {BENEFITS.map((b) => (
          <li
            key={b.title}
            className="flex flex-col gap-1.5 rounded-[10px] border border-border-default bg-surface-muted/40 p-3.5"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {b.icon}
              </svg>
            </span>
            <span className="text-[13px] font-semibold text-text-primary">
              {b.title}
            </span>
            <span className="text-[12px] leading-[1.45] text-text-secondary">
              {b.body}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

type PreCallContextProps = {
  value: string;
  onChange: (value: string) => void;
  fieldId?: string;
};

/** Context tab before a meeting exists: explains the value, keeps a local draft. */
export function PreCallContext({
  value,
  onChange,
  fieldId = "pre-call-context-editor",
}: PreCallContextProps) {
  return (
    <section className="flex max-w-[760px] flex-col gap-4">
      <ContextIntro />
      <div>
        <label
          className="mb-1.5 block text-[12px] text-text-secondary"
          htmlFor={fieldId}
        >
          Context
        </label>
        <textarea
          id={fieldId}
          className="block min-h-[210px] w-full resize-y rounded-md border border-border-input bg-surface-input px-3 py-2.5 font-[family-name:inherit] text-[13px] leading-[1.45] text-text-primary outline-none focus:border-brand-primary-focus focus:shadow-[0_0_0_2px_var(--brand-primary-ring)]"
          rows={9}
          value={value}
          placeholder={
            "Participants: Maya (PM), Sam (design), Jordan (eng)\nGoal: decide whether the new onboarding ships Friday\nBackground: beta feedback doc, pricing still open"
          }
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="mt-2 text-[12px] text-text-muted">
          Saved with the meeting when you start · Amie reads it when the
          summary is written
        </p>
      </div>
    </section>
  );
}
