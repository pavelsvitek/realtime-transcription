/** Google Meet extension speaker-tracking — anonymized meter traces for detector fixtures. */

export type TraceEvent = { t: number; participantId: string; tokens: string };

export function anonymizeTrace(
  events: TraceEvent[],
  roster: { id: string; name: string }[],
): { events: TraceEvent[]; roster: { id: string; name: string }[] } {
  const alias = new Map<string, string>();
  let next = 1;
  const nameFor = (id: string) => {
    const existing = alias.get(id);
    if (existing) return existing;
    const created = `P${next}`;
    next += 1;
    alias.set(id, created);
    return created;
  };
  return {
    events: events.map((event) => ({ ...event, participantId: nameFor(event.participantId) })),
    roster: roster.map((participant) => {
      const id = nameFor(participant.id);
      return { id, name: id };
    }),
  };
}
