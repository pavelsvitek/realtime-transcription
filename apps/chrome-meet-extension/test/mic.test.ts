/** Google Meet extension speaker-tracking — the local user's mic button. */
import { describe, expect, it } from "vitest";
import { readMicMuted } from "../src/content/mic";
import { applyContentEvent, emptyTab } from "../src/sw-state";
import { parseClientMessage } from "../src/protocol";

function toolbar(html: string) {
  document.body.innerHTML = `<div>${html}</div>`;
  return document;
}

describe("readMicMuted", () => {
  it("reads the Meet toggle attribute and ignores the camera button", () => {
    const doc = toolbar(`
      <button aria-label="Turn off camera" data-is-muted="true"></button>
      <button aria-label="Turn off microphone" data-is-muted="false"></button>`);
    expect(readMicMuted(doc)).toBe(false);
    const muted = toolbar(`
      <button aria-label="Turn off camera" data-is-muted="false"></button>
      <button aria-label="Turn on microphone" data-is-muted="true"></button>`);
    expect(readMicMuted(muted)).toBe(true);
  });

  it("works in other languages through the attribute", () => {
    expect(
      readMicMuted(toolbar(`<button aria-label="Mikrofon ausschalten" data-is-muted="false"></button>`)),
    ).toBe(false);
    expect(
      readMicMuted(toolbar(`<button aria-label="Mikrofon einschalten" data-is-muted="true"></button>`)),
    ).toBe(true);
  });

  it("falls back to the English label when the attribute is missing", () => {
    expect(readMicMuted(toolbar(`<button aria-label="Turn on microphone"></button>`))).toBe(true);
    expect(readMicMuted(toolbar(`<button aria-label="Turn off microphone"></button>`))).toBe(false);
  });

  it("answers unknown, never muted, when it cannot tell", () => {
    expect(readMicMuted(toolbar(`<button aria-label="Leave call"></button>`))).toBeNull();
    expect(readMicMuted(toolbar(`<button aria-label="Microphone"></button>`))).toBeNull();
    expect(readMicMuted(toolbar(``))).toBeNull();
  });
});

describe("mic state in the service worker model", () => {
  it("tracks mic events and heartbeats, keeps the last answer, and resets on leave", () => {
    let tab = emptyTab("b1f:1");
    expect(tab.micMuted).toBeNull();
    tab = applyContentEvent(tab, { type: "mic", muted: true });
    expect(tab.micMuted).toBe(true);
    expect(tab.joined).toBe(true);
    const beat = {
      type: "heartbeat" as const,
      seq: 1,
      observed_at: 5,
      speaking: [],
      visibility: "visible" as const,
      health: { meters: 1, last_meter_change_ms_ago: null, selectors: "default" as const },
    };
    tab = applyContentEvent(tab, { ...beat, mic_muted: null });
    expect(tab.micMuted).toBe(true);
    tab = applyContentEvent(tab, { ...beat, mic_muted: false });
    expect(tab.micMuted).toBe(false);
    tab = applyContentEvent(tab, { type: "mic", muted: true });
    tab = applyContentEvent(tab, { type: "call", state: "left", meeting_code: null, observed_at: 9 });
    expect(tab.micMuted).toBeNull();
  });

  it("parses the mic frame and rejects a malformed one", () => {
    expect(parseClientMessage({ type: "mic", tab: "b1f:1", muted: true })).not.toBeNull();
    expect(parseClientMessage({ type: "mic", tab: "b1f:1", muted: "yes" })).toBeNull();
  });
});
