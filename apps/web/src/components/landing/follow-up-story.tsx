import { FOLLOW_UP_STYLES } from "./follow-up-styles";

export function FollowUpStory({
  appearance,
}: {
  appearance: "light" | "dark";
}) {
  return (
    <article className="flex flex-col gap-16">
      <div className="max-w-xl">
        <h2 className="amie-display text-[clamp(1.7rem,3vw,2.35rem)]">
          Last call’s decisions open the next one
        </h2>
        <p className="mt-3 text-[16px] leading-7 text-[color:var(--amie-muted)]">
          Ten ways to say ⌘⇧N. Scroll them. Keep the one that reads in a glance.
        </p>
      </div>
      <nav aria-label="Follow-up styles">
        <ol className="flex flex-wrap gap-2">
          {FOLLOW_UP_STYLES.map((item, index) => (
            <li key={item.id}>
              <a
                href={`#followup-${item.id}`}
                className="inline-flex rounded-[10px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-2.5 py-1.5 text-[12px] text-[color:var(--amie-ink)] hover:border-amie hover:text-amie"
              >
                {index + 1} {item.name}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col gap-24">
        {FOLLOW_UP_STYLES.map((item, index) => (
          <section key={item.id} id={`followup-${item.id}`} className="scroll-mt-24">
            <h3 className="amie-display text-[clamp(1.35rem,2.2vw,1.85rem)]">
              {index + 1}. {item.name}
            </h3>
            <div className="mt-6">
              <item.Style appearance={appearance} />
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
