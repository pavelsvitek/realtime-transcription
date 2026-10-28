/** Google Meet extension speaker-tracking — restyled fake Meet must keep Ada remote. */
import { describe, expect, it } from "vitest";
import { detectCall } from "../src/content/call";
import { createDetector } from "../src/content/detector";
import { readRoster } from "../src/content/roster";
import { DEFAULT_SELECTORS } from "../src/content/selectors";
import { selfIdFromCorrelation } from "../src/content/self";
import { applyContentEvent, emptyTab, remoteSpeakingNames, selfSpeakingNames } from "../src/sw-state";

const ADA = "spaces/fake/devices/1";
const PAVEL = "spaces/fake/devices/2";
const SAM = "spaces/fake/devices/3";
const LEVELS = ["HX2H7", "OgVli", "Oaajhc", "wEsLMd"];

/** Mirrors `fake-meet/index.html` (Ada + Sam remotes, Pavel self, toolbar meter). */
const FAKE_MEET_MARKUP = `
  <div class="tile" id="ada-tile" data-participant-id="${ADA}" role="listitem" aria-label="Ada Lovelace">
    <div class="tile-footer">
      <span class="notranslate">Ada Lovelace</span>
      <div jsname="QgSmzd" id="ada-meter" class="gjg47c"></div>
    </div>
  </div>
  <div class="tile" id="sam-tile" data-participant-id="${SAM}" role="listitem" aria-label="Sam Rivera">
    <div class="tile-footer">
      <span class="notranslate">Sam Rivera</span>
      <div jsname="QgSmzd" id="sam-meter" class="gjg47c"></div>
    </div>
  </div>
  <div class="tile" id="pavel-tile" data-participant-id="${PAVEL}" role="listitem" aria-label="Pavel Svitek (You)">
    <div class="tile-footer">
      <span>
        <span class="notranslate">Pavel Svitek</span><span class="you-tag">(You)</span>
      </span>
      <div jsname="QgSmzd" id="self-meter" class="gjg47c"></div>
    </div>
  </div>
  <div jsname="QgSmzd" id="toolbar-meter" class="gjg47c"></div>
`;

function loadFakeMeet() {
  document.body.innerHTML = FAKE_MEET_MARKUP;
}

function meterParentId(id: string): string | null {
  const el = document.getElementById(id);
  return el?.closest(DEFAULT_SELECTORS.participant)?.getAttribute("data-participant-id") ?? null;
}

function namesFromPipeline(opts: { ada?: boolean; sam?: boolean; pavel?: boolean; startAt?: number }) {
  const startAt = opts.startAt ?? 10_000;
  const detector = createDetector();
  const toolbarChanges: number[] = [];
  const participantChanges = new Map<string, number[]>();

  const remember = (id: string | null, at: number) => {
    const bucket = id == null ? toolbarChanges : (participantChanges.get(id) ?? []);
    bucket.push(at);
    const trimmed = bucket.slice(-32);
    if (id == null) {
      toolbarChanges.length = 0;
      toolbarChanges.push(...trimmed);
      return;
    }
    participantChanges.set(id, trimmed);
  };

  const emit = (id: string | null, meterId: string, at: number, tokens: string) => {
    remember(id, at);
    if (id) detector.onMeter({ participantId: id, meterId, at, tokens });
  };

  emit(ADA, "ada-meter", 0, "gjg47c");
  emit(SAM, "sam-meter", 0, "gjg47c");
  emit(PAVEL, "self-meter", 0, "gjg47c");
  emit(null, "toolbar-meter", 0, "gjg47c");
  // Learn idle while every meter rests. Speech after this is an off-idle excursion.
  detector.speaking(startAt - 1);

  for (let i = 0; i < 8; i += 1) {
    const at = startAt + i * 100;
    const tokens = LEVELS[i % LEVELS.length];
    if (opts.ada) emit(ADA, "ada-meter", at, tokens);
    if (opts.sam) emit(SAM, "sam-meter", at, tokens);
    if (opts.pavel) {
      emit(PAVEL, "self-meter", at, tokens);
      emit(null, "toolbar-meter", at, tokens);
    }
  }

  let participants = readRoster(document, DEFAULT_SELECTORS, []);
  const correlated = participants.some((participant) => participant.self)
    ? null
    : selfIdFromCorrelation(toolbarChanges, participantChanges);
  if (correlated) {
    participants = participants.map((participant) =>
      participant.id === correlated ? { ...participant, self: true } : participant,
    );
  }
  const now = startAt + 700;
  const speaking = [...detector.speaking(now)].sort();
  let tab = emptyTab("instance:1");
  tab = applyContentEvent(tab, {
    type: "call",
    state: "joined",
    meeting_code: "abc-defg-hij",
    observed_at: now,
  });
  tab = applyContentEvent(tab, { type: "roster", participants });
  tab = applyContentEvent(tab, { type: "speakers", seq: 1, observed_at: now, speaking });
  return { participants, speaking, correlated, remote: remoteSpeakingNames([tab]), self: selfSpeakingNames([tab]) };
}

describe("fake Meet HTML after Meet-like restyle", () => {
  it("keeps QgSmzd meters inside tiles and toolbar unowned", () => {
    loadFakeMeet();
    expect(detectCall("/abc-defg-hij", document, DEFAULT_SELECTORS)).toEqual({
      inCall: true,
      code: "abc-defg-hij",
    });
    expect(document.querySelectorAll(DEFAULT_SELECTORS.meter)).toHaveLength(4);
    expect(meterParentId("ada-meter")).toBe(ADA);
    expect(meterParentId("sam-meter")).toBe(SAM);
    expect(meterParentId("self-meter")).toBe(PAVEL);
    expect(meterParentId("toolbar-meter")).toBeNull();
    expect(readRoster(document, DEFAULT_SELECTORS, [])).toEqual([
      { id: ADA, name: "Ada Lovelace", self: false },
      { id: SAM, name: "Sam Rivera", self: false },
      { id: PAVEL, name: "Pavel Svitek", self: true },
    ]);
  });

  it("Ada and Sam stay remote; Pavel talks is self-only", () => {
    loadFakeMeet();
    const adaOnly = namesFromPipeline({ ada: true });
    expect(adaOnly.speaking).toContain(ADA);
    expect(adaOnly.speaking).not.toContain(PAVEL);
    expect(adaOnly.participants.find((participant) => participant.id === ADA)?.self).toBe(false);
    expect(adaOnly.remote).toEqual(["Ada Lovelace"]);
    expect(adaOnly.self).toEqual([]);

    const samOnly = namesFromPipeline({ sam: true });
    expect(samOnly.speaking).toContain(SAM);
    expect(samOnly.participants.find((participant) => participant.id === SAM)?.self).toBe(false);
    expect(samOnly.remote).toEqual(["Sam Rivera"]);
    expect(samOnly.self).toEqual([]);

    const remotes = namesFromPipeline({ ada: true, sam: true });
    expect(remotes.remote).toEqual(["Ada Lovelace", "Sam Rivera"]);
    expect(remotes.self).toEqual([]);

    const pavelOnly = namesFromPipeline({ pavel: true });
    expect(pavelOnly.speaking).toContain(PAVEL);
    expect(pavelOnly.remote).toEqual([]);
    expect(pavelOnly.self).toEqual(["Pavel Svitek"]);

    const all = namesFromPipeline({ ada: true, sam: true, pavel: true });
    expect(all.speaking).toEqual([ADA, PAVEL, SAM].sort());
    expect(all.participants.find((participant) => participant.id === ADA)?.self).toBe(false);
    expect(all.participants.find((participant) => participant.id === SAM)?.self).toBe(false);
    expect(all.remote).toEqual(["Ada Lovelace", "Sam Rivera"]);
    expect(all.self).toEqual(["Pavel Svitek"]);
  });
});
