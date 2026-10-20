/** Google Meet extension speaker-tracking — roster and self from a Meet tile snapshot. */
import { describe, expect, it } from "vitest";
import { detectCall, meetingCodeFromPath } from "../src/content/call";
import { readRoster } from "../src/content/roster";
import { DEFAULT_SELECTORS } from "../src/content/selectors";
import { applyContentEvent, createPendingQueue, emptyTab, remoteSpeakingNames } from "../src/sw-state";
import { selfIdFromCorrelation, stripYou } from "../src/content/self";
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
  it("treats the advertised path as in-call and reads Ada plus self", () => {
    document.body.innerHTML = `
      <div class="tile" data-participant-id="spaces/fake/devices/1" role="listitem" aria-label="Ada Lovelace">
        <span class="notranslate">Ada Lovelace</span>
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
    expect(document.querySelectorAll(DEFAULT_SELECTORS.meter)).toHaveLength(3);
    expect(readRoster(document, DEFAULT_SELECTORS, [])).toEqual([
      { id: "spaces/fake/devices/1", name: "Ada Lovelace", self: false },
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
