/** Google Meet extension speaker-tracking — roster and self from a Meet tile snapshot. */
import { describe, expect, it } from "vitest";
import { detectCall, meetingCodeFromPath } from "../src/content/call";
import { createDetector } from "../src/content/detector";
import { readRoster } from "../src/content/roster";
import { DEFAULT_SELECTORS } from "../src/content/selectors";
import { applyContentEvent, createPendingQueue, emptyTab, remoteSpeakingNames, selfSpeakingNames } from "../src/sw-state";
import { looksLikeYou, selfIdFromCorrelation, stripYou } from "../src/content/self";
import { isDiscoveryCandidate } from "../src/content/discovery";
import { anonymizeTrace } from "../src/content/trace";

const html = `
  <div data-participant-id="spaces/a/devices/96" role="listitem" aria-label="Ada Lovelace">
    <span class="notranslate">Ada Lovelace</span>
  </div>
  <div data-participant-id="spaces/a/devices/95" role="listitem" aria-label="Pavel Svitek (You)">
    <span class="notranslate">Pavel Svitek (You)</span>
  </div>
  <div data-participant-id="spaces/a/devices/96">
    <span class="notranslate">Ada Lovelace</span>
  </div>
`;

describe("Meet roster and call", () => {
  it("reads the meeting code only for an in-call path", () => {
    expect(meetingCodeFromPath("/xfc-vvyo-cwt")).toBe("xfc-vvyo-cwt");
    expect(meetingCodeFromPath("/abc-defg-hij")).toBe("abc-defg-hij");
    expect(meetingCodeFromPath("/lookup/abc")).toBeNull();
    document.body.innerHTML = html;
    expect(detectCall("/xfc-vvyo-cwt", document, DEFAULT_SELECTORS).inCall).toBe(true);
    expect(detectCall("/", document, DEFAULT_SELECTORS).inCall).toBe(false);
  });

  it("prefers the panel name and marks (You)", () => {
    document.body.innerHTML = html;
    const roster = readRoster(document, DEFAULT_SELECTORS, []);
    expect(roster).toEqual([
      { id: "spaces/a/devices/96", name: "Ada Lovelace", self: false },
      { id: "spaces/a/devices/95", name: "Pavel Svitek", self: true },
    ]);
    expect(stripYou("Pavel Svitek (You)")).toBe("Pavel Svitek");
    expect(stripYou("Pavel Svitek (You), muted")).toBe("Pavel Svitek, muted");
    expect(looksLikeYou("Pavel Svitek (You), muted")).toBe(true);
    expect(looksLikeYou("Pavel Svitek (You) presenting")).toBe(true);
    expect(looksLikeYou("Nick Heller")).toBe(false);
  });

  it("marks self from a tile whose accessible name continues after (You)", () => {
    document.body.innerHTML = `
      <div data-participant-id="spaces/a/devices/96">
        <span class="notranslate">Nick Heller</span>
      </div>
      <div data-participant-id="spaces/a/devices/95" aria-label="Pavel Svitek (You), muted">
        <span class="notranslate">Pavel Svitek (You), muted</span>
      </div>
    `;
    expect(readRoster(document, DEFAULT_SELECTORS, [])).toEqual([
      { id: "spaces/a/devices/96", name: "Nick Heller", self: false },
      { id: "spaces/a/devices/95", name: "Pavel Svitek, muted", self: true },
    ]);
  });

  it("keeps the last name when the tile text disappears", () => {
    document.body.innerHTML = html;
    const first = readRoster(document, DEFAULT_SELECTORS, []);
    document.body.innerHTML = `<div data-participant-id="spaces/a/devices/96"></div>`;
    const second = readRoster(document, DEFAULT_SELECTORS, first);
    expect(second[0]).toMatchObject({ id: "spaces/a/devices/96", name: "Ada Lovelace" });
  });

  it("correlates the toolbar meter with self", () => {
    const toolbar = [0, 100, 200, 300];
    const changes = new Map<string, number[]>([
      ["self", [2, 101, 198, 301]],
      ["ada", [1000, 1100, 1200, 1300]],
    ]);
    expect(selfIdFromCorrelation(toolbar, changes)).toBe("self");
  });

  it("does not mark a remote as self when two tiles lockstep the toolbar", () => {
    const toolbar = [0, 100, 200, 300, 400, 500];
    const lockstep = [0, 100, 200, 300, 400, 500];
    const changes = new Map<string, number[]>([
      ["spaces/fake/devices/1", lockstep],
      ["spaces/fake/devices/2", lockstep],
    ]);
    expect(selfIdFromCorrelation(toolbar, changes)).toBeNull();
  });

  it("keeps a churning self tile off the remote speaking set", () => {
    const nick = "spaces/a/devices/nick";
    const pavel = "spaces/a/devices/pavel";
    // Not a people-panel row. "(You)" is not the end of the accessible name.
    document.body.innerHTML = `
      <div data-participant-id="${nick}">
        <span class="notranslate">Nick Heller</span>
        <div jsname="QgSmzd" class="gjg47c"></div>
      </div>
      <div data-participant-id="${pavel}" aria-label="Pavel Svitek (You), muted">
        <span class="notranslate">Pavel Svitek</span><span>(You)</span><span>microphone off</span>
        <div jsname="QgSmzd" class="gjg47c"></div>
      </div>
    `;

    const detector = createDetector();
    const toolbarChanges: number[] = [];
    const participantChanges = new Map<string, number[]>();
    const emit = (id: string | null, at: number, tokens: string) => {
      const bucket = id == null ? toolbarChanges : (participantChanges.get(id) ?? []);
      bucket.push(at);
      const trimmed = bucket.slice(-32);
      if (id == null) {
        toolbarChanges.length = 0;
        toolbarChanges.push(...trimmed);
        return;
      }
      participantChanges.set(id, trimmed);
      detector.onMeter({ participantId: id, meterId: `${id}-tile`, at, tokens });
    };

    emit(nick, 0, "idle");
    // Self tile class keeps changing, so idle is never learned. The live mic is silent;
    // this is not an off-idle excursion that belongs to Pavel.
    for (let i = 0; i <= 39; i += 1) emit(pavel, i * 100, `self-${i}`);
    detector.speaking(1_600);
    const nickSpeech = [4_000, 4_100, 4_200, 4_300];
    for (const at of nickSpeech) {
      emit(nick, at, `nick-${at}`);
      emit(null, at, `toolbar-${at}`);
    }

    const now = 4_300;
    const speaking = [...detector.speaking(now)].sort();
    let participants = readRoster(document, DEFAULT_SELECTORS, []);
    // Same rule as the content script: lockstep only when nobody is already "(You)".
    if (!participants.some((participant) => participant.self)) {
      const correlated = selfIdFromCorrelation(toolbarChanges, participantChanges);
      if (correlated) {
        participants = participants.map((participant) =>
          participant.id === correlated ? { ...participant, self: true } : participant,
        );
      }
    }
    // Nick's meter matches the toolbar exactly. That must not mark him; "(You)" already did.
    expect(selfIdFromCorrelation(toolbarChanges, participantChanges)).toBe(nick);

    let tab = emptyTab("instance:1");
    tab = applyContentEvent(tab, {
      type: "call",
      state: "joined",
      meeting_code: "d52c5bdd",
      observed_at: now,
    });
    tab = applyContentEvent(tab, { type: "roster", participants });
    tab = applyContentEvent(tab, { type: "speakers", seq: 1, observed_at: now, speaking });

    expect(participants).toEqual([
      { id: nick, name: "Nick Heller", self: false },
      { id: pavel, name: "Pavel Svitek", self: true },
    ]);
    expect(speaking).toEqual([nick]);
    expect(remoteSpeakingNames([tab])).toEqual(["Nick Heller"]);
    expect(remoteSpeakingNames([tab])).not.toContain("Pavel Svitek");
    expect(selfSpeakingNames([tab])).toEqual([]);
  });

  it("attributes a real off-idle self excursion to self only", () => {
    const nick = "spaces/a/devices/nick";
    const pavel = "spaces/a/devices/pavel";
    document.body.innerHTML = `
      <div data-participant-id="${nick}">
        <span class="notranslate">Nick Heller</span>
      </div>
      <div data-participant-id="${pavel}">
        <span class="notranslate">Pavel Svitek</span><span>(You)</span><span>presenting</span>
      </div>
    `;
    const detector = createDetector();
    detector.onMeter({ participantId: nick, meterId: "nick-tile", at: 0, tokens: "idle" });
    detector.onMeter({ participantId: pavel, meterId: "pavel-tile", at: 0, tokens: "idle" });
    detector.speaking(1_600);
    detector.onMeter({ participantId: nick, meterId: "nick-tile", at: 2_000, tokens: "n1" });
    detector.onMeter({ participantId: nick, meterId: "nick-tile", at: 2_100, tokens: "n2" });
    detector.onMeter({ participantId: pavel, meterId: "pavel-tile", at: 2_000, tokens: "p1" });
    detector.onMeter({ participantId: pavel, meterId: "pavel-tile", at: 2_100, tokens: "p2" });
    const now = 2_200;
    const speaking = [...detector.speaking(now)].sort();
    const participants = readRoster(document, DEFAULT_SELECTORS, []);
    let tab = emptyTab("instance:1");
    tab = applyContentEvent(tab, {
      type: "call",
      state: "joined",
      meeting_code: "d52c5bdd",
      observed_at: now,
    });
    tab = applyContentEvent(tab, { type: "roster", participants });
    tab = applyContentEvent(tab, { type: "speakers", seq: 1, observed_at: now, speaking });

    expect(participants.find((participant) => participant.id === pavel)).toEqual({
      id: pavel,
      name: "Pavel Svitek",
      self: true,
    });
    expect(speaking).toEqual([nick, pavel].sort());
    expect(remoteSpeakingNames([tab])).toEqual(["Nick Heller"]);
    expect(selfSpeakingNames([tab])).toEqual(["Pavel Svitek"]);
  });

  it("anonymizes traces and accepts a discovered meter shape", () => {
    const anonymized = anonymizeTrace(
      [{ t: 1, participantId: "spaces/a/devices/96", tokens: "a" }],
      [{ id: "spaces/a/devices/96", name: "Ada Lovelace" }],
    );
    expect(anonymized.events[0]?.participantId).toBe("P1");
    expect(anonymized.roster[0]).toEqual({ id: "P1", name: "P1" });
    expect(JSON.stringify(anonymized)).not.toContain("Ada");
    const flips = ["a", "b", "a", "c", "b"].map((tokens, index) => ({ tokens, at: index * 100 }));
    expect(isDiscoveryCandidate(flips, 500, true)).toBe(true);
    expect(isDiscoveryCandidate(flips, 500, false)).toBe(false);
  });
});

describe("fake Meet page", () => {
  it("treats the advertised path as in-call and reads Ada, Sam, plus self", () => {
    document.body.innerHTML = `
      <div class="tile" data-participant-id="spaces/fake/devices/1" role="listitem" aria-label="Ada Lovelace">
        <span class="notranslate">Ada Lovelace</span>
        <div jsname="QgSmzd" class="gjg47c"></div>
      </div>
      <div class="tile" data-participant-id="spaces/fake/devices/3" role="listitem" aria-label="Sam Rivera">
        <span class="notranslate">Sam Rivera</span>
        <div jsname="QgSmzd" class="gjg47c"></div>
      </div>
      <div class="tile" data-participant-id="spaces/fake/devices/2" role="listitem" aria-label="Pavel Svitek (You)">
        <span class="notranslate">Pavel Svitek</span>
        <div jsname="QgSmzd" class="gjg47c"></div>
      </div>
      <div jsname="QgSmzd" id="toolbar-meter" class="gjg47c"></div>
    `;
    expect(detectCall("/abc-defg-hij", document, DEFAULT_SELECTORS)).toEqual({
      inCall: true,
      code: "abc-defg-hij",
    });
    expect(detectCall("/", document, DEFAULT_SELECTORS).inCall).toBe(false);
    expect(document.querySelectorAll(DEFAULT_SELECTORS.meter)).toHaveLength(4);
    expect(readRoster(document, DEFAULT_SELECTORS, [])).toEqual([
      { id: "spaces/fake/devices/1", name: "Ada Lovelace", self: false },
      { id: "spaces/fake/devices/3", name: "Sam Rivera", self: false },
      { id: "spaces/fake/devices/2", name: "Pavel Svitek", self: true },
    ]);
  });

  it("keeps call and roster that arrive before the service worker finishes attaching", () => {
    const queue = createPendingQueue<string>();
    const seen: string[] = [];
    queue.push("call", (item) => seen.push(item));
    queue.push("roster", (item) => seen.push(item));
    expect(seen).toEqual([]);
    queue.open((item) => seen.push(item));
    queue.push("heartbeat", (item) => seen.push(item));
    expect(seen).toEqual(["call", "roster", "heartbeat"]);

    let tab = emptyTab("instance:1");
    tab = applyContentEvent(tab, {
      type: "call",
      state: "joined",
      meeting_code: "abc-defg-hij",
      observed_at: 1,
    });
    tab = applyContentEvent(tab, {
      type: "roster",
      participants: [
        { id: "spaces/fake/devices/1", name: "Ada Lovelace", self: false },
        { id: "spaces/fake/devices/2", name: "Pavel Svitek", self: true },
      ],
    });
    tab = applyContentEvent(tab, {
      type: "speakers",
      seq: 1,
      observed_at: 2,
      speaking: ["spaces/fake/devices/1"],
    });
    expect(tab.meetingCode).toBe("abc-defg-hij");
    expect(remoteSpeakingNames([tab])).toEqual(["Ada Lovelace"]);
  });
});
