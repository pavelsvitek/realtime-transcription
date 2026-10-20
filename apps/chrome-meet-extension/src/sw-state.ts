/** Google Meet extension speaker-tracking — in-call Meet tabs multiplexed toward `meet_bridge`. */

import type { ContentEvent, Participant } from "./protocol";

export type TabModel = {
  tabKey: string;
  joined: boolean;
  meetingCode: string | null;
  participants: Participant[];
  speaking: string[];
  seq: number;
  observedAt: number;
};

export function emptyTab(tabKey: string): TabModel {
  return {
    tabKey,
    joined: false,
    meetingCode: null,
    participants: [],
    speaking: [],
    seq: 0,
    observedAt: 0,
  };
}

export function applyContentEvent(tab: TabModel, event: ContentEvent): TabModel {
  switch (event.type) {
    case "call":
      if (event.state === "left") {
        return { ...emptyTab(tab.tabKey), observedAt: event.observed_at };
      }
      return {
        ...tab,
        joined: true,
        meetingCode: event.meeting_code,
        observedAt: event.observed_at,
      };
    case "roster":
      return { ...tab, joined: true, participants: event.participants };
    case "speakers":
    case "heartbeat":
      return {
        ...tab,
        joined: true,
        speaking: event.speaking,
        seq: event.seq,
        observedAt: event.observed_at,
      };
    default:
      return tab;
  }
}

export function remoteSpeakingNames(tabs: Iterable<TabModel>): string[] {
  const list = [...tabs];
  const selfNames = new Set(
    list.flatMap((tab) => tab.participants.filter((participant) => participant.self).map((participant) => participant.name)),
  );
  const names = new Set<string>();
  for (const tab of list) {
    if (!tab.joined) continue;
    const byId = new Map(tab.participants.map((participant) => [participant.id, participant]));
    for (const id of tab.speaking) {
      const participant = byId.get(id);
      if (!participant || participant.self || selfNames.has(participant.name)) continue;
      if (participant.name) names.add(participant.name);
    }
  }
  return [...names].sort();
}

/** Self display names currently in the speaking set (still present on the wire; stripped from remote labels). */
export function selfSpeakingNames(tabs: Iterable<TabModel>): string[] {
  const names = new Set<string>();
  for (const tab of tabs) {
    if (!tab.joined) continue;
    const byId = new Map(tab.participants.map((participant) => [participant.id, participant]));
    for (const id of tab.speaking) {
      const participant = byId.get(id);
      if (!participant?.self || !participant.name) continue;
      names.add(participant.name);
    }
  }
  return [...names].sort();
}

export function hasInCallTab(tabs: Iterable<TabModel>): boolean {
  for (const tab of tabs) {
    if (tab.joined) return true;
  }
  return false;
}

/** Holds port messages that arrive before async tab setup finishes, then flushes in order. */
export function createPendingQueue<T>() {
  const pending: T[] = [];
  let open = false;
  return {
    push(item: T, handle: (item: T) => void) {
      if (!open) {
        pending.push(item);
        return;
      }
      handle(item);
    },
    open(handle: (item: T) => void) {
      open = true;
      for (const item of pending.splice(0)) handle(item);
    },
  };
}
