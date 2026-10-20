import { SPEAKER_STYLES } from "./speaker-styles";

export function SpeakerStory({
  appearance,
}: {
  appearance: "light" | "dark";
}) {
  return (
    <article className="flex flex-col gap-16">
      <div className="max-w-xl">
        <h2 className="amie-display text-[clamp(1.7rem,3vw,2.35rem)]">
          The name on the tile is the name in the notes
        </h2>
        <p className="mt-3 text-[16px] leading-7 text-[color:var(--amie-muted)]">
          Ten ways to say where the speaker name comes from. Scroll them. Keep
          the one that reads in a glance.
        </p>
      </div>
      <nav aria-label="Speaker-name styles">
        <ol className="flex flex-wrap gap-2">
          {SPEAKER_STYLES.map((item, index) => (
            <li key={item.id}>
              <a
                href={`#speaker-${item.id}`}
                className="inline-flex rounded-[10px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-2.5 py-1.5 text-[12px] text-[color:var(--amie-ink)] hover:border-amie hover:text-amie"
              >
                {index + 1} {item.name}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col gap-24">
        {SPEAKER_STYLES.map((item, index) => (
          <section key={item.id} id={`speaker-${item.id}`} className="scroll-mt-24">
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
