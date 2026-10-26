/** Google Meet extension speaker-tracking — participant id → display name and self. */

import type { Participant } from "../protocol";
import type { Selectors } from "./selectors";
import { looksLikeYou, stripYou } from "./self";

export function readRoster(
  root: ParentNode,
  selectors: Selectors,
  previous: Participant[],
): Participant[] {
  const known = new Map(previous.map((participant) => [participant.id, participant]));
  const found = new Map<string, Participant>();
  const nodes = root.querySelectorAll(selectors.participant);
  nodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    const id = node.getAttribute("data-participant-id");
    if (!id) return;
    const panel = node.matches(selectors.panelRow);
    const named = panel ? panelName(node) : tileName(node, selectors);
    const you = marksSelf(node);
    const current = found.get(id) ?? {
      id,
      name: known.get(id)?.name ?? "",
      self: known.get(id)?.self ?? false,
    };
    if (named) {
      if (panel || !current.name) current.name = named;
    }
    if (you) current.self = true;
    found.set(id, current);
  });
  return [...found.values()];
}

/** Tiles and panel rows. "(You)" may sit in the accessible name with text after it. */
function marksSelf(node: Element): boolean {
  const label = node.getAttribute("aria-label") ?? "";
  if (looksLikeYou(label)) return true;
  return looksLikeYou(node.textContent ?? "");
}

function panelName(node: Element): string | null {
  const label = node.getAttribute("aria-label");
  if (!label) return null;
  const name = stripYou(label);
  return name || null;
}

function tileName(node: Element, selectors: Selectors): string | null {
  const span = node.querySelector(selectors.name);
  const text = stripYou(span?.textContent?.trim() ?? "");
  return text || null;
}
