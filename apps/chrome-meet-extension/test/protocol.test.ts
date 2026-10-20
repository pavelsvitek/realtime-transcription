/** Google Meet extension speaker-tracking — shared `meet_bridge` protocol fixture. */
import { describe, expect, it } from "vitest";
import fixture from "../fixtures/meet_bridge/v1-frames.json";
import { parseClientMessage, parseServerMessage } from "../src/protocol";
import { applyContentEvent, emptyTab, remoteSpeakingNames } from "../src/sw-state";
import { backoffDelay, nextPort, portOrder } from "../src/transport";

describe("meet_bridge protocol fixture", () => {
  it("parses every client frame and the welcome", () => {
    for (const frame of [
      fixture.hello,
      fixture.call_joined,
      fixture.call_left,
      fixture.roster,
      fixture.speakers,
      fixture.heartbeat,
      fixture.health,
    ]) {
      expect(parseClientMessage(frame)).not.toBeNull();
    }
    expect(parseServerMessage(JSON.stringify(fixture.welcome))?.type).toBe("welcome");
    expect(parseClientMessage({ type: "hello", protocol: 2 })).toBeNull();
  });

  it("tries the last good port first and backs off", () => {
    expect(portOrder(47823)[0]).toBe(47823);
    expect(nextPort(null, 5)).toBe(47821);
    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(9)).toBe(10000);
  });

  it("resolves remote speaking names and drops self", () => {
    let tab = emptyTab("b1f:1");
    tab = applyContentEvent(tab, {
      type: "call",
      state: "joined",
      meeting_code: "abc-defg-hij",
      observed_at: 10,
    });
    tab = applyContentEvent(tab, {
      type: "roster",
      participants: [
        { id: "ada", name: "Ada Lovelace", self: false },
        { id: "me", name: "Pavel Svitek", self: true },
      ],
    });
    tab = applyContentEvent(tab, {
      type: "speakers",
      seq: 2,
      observed_at: 20,
      speaking: ["ada", "me"],
    });
    expect(remoteSpeakingNames([tab])).toEqual(["Ada Lovelace"]);
    tab = applyContentEvent(tab, { type: "call", state: "left", meeting_code: null, observed_at: 30 });
    expect(tab.joined).toBe(false);
  });
});
