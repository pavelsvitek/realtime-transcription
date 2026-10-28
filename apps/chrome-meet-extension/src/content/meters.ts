/** Google Meet extension speaker-tracking — MutationObserver from Meet level meters into the detector. */

import { isDiscoveryCandidate, type ClassFlip } from "./discovery";
import { observedAt } from "./time";
import type { Selectors } from "./selectors";

export type MeterHit = {
  participantId: string | null;
  meterId: string;
  at: number;
  tokens: string;
};

export type MeterWatch = {
  stop: () => void;
  meterCount: () => number;
  lastChangeAt: () => number | null;
  usingDiscoveredSelector: () => boolean;
};

const meterIds = new WeakMap<Element, string>();
let nextMeterId = 1;

export function classTokens(className: string): string {
  return className.split(/\s+/).filter(Boolean).sort().join(" ");
}

export function meterElementId(element: Element): string {
  const existing = meterIds.get(element);
  if (existing) return existing;
  const id = `m${nextMeterId}`;
  nextMeterId += 1;
  meterIds.set(element, id);
  return id;
}

export function watchMeters(
  doc: Document,
  selectors: () => Selectors,
  onHit: (hit: MeterHit) => void,
  onStructure: () => void,
  onDiscovered: (meterSelector: string) => void,
): MeterWatch {
  let lastChange: number | null = null;
  let discovered = false;
  let discoveryArmed = false;
  let tilesSince: number | null = null;
  const flips = new Map<Element, ClassFlip[]>();

  const emit = (element: Element) => {
    const tokens = classTokens(element.className);
    const participant = element.closest(selectors().participant);
    const participantId = participant?.getAttribute("data-participant-id") ?? null;
    const at = observedAt();
    lastChange = at;
    onHit({
      participantId,
      meterId: meterElementId(element),
      at,
      tokens,
    });
  };

  const scan = () => {
    doc.querySelectorAll(selectors().meter).forEach((element) => {
      if (element instanceof Element) emit(element);
    });
  };

  const classObserver = new MutationObserver((mutations) => {
    const current = selectors();
    for (const mutation of mutations) {
      const target = mutation.target;
      if (!(target instanceof Element)) continue;
      if (target.matches(current.meter)) {
        emit(target);
        continue;
      }
      if (!discoveryArmed || discovered || doc.querySelector(current.meter)) continue;
      const tile = target.closest(current.participant);
      if (!tile || target === tile) continue;
      const small = target.getBoundingClientRect().width < 48 && target.getBoundingClientRect().height < 48;
      const history = flips.get(target) ?? [];
      history.push({ tokens: classTokens(target.className), at: observedAt() });
      flips.set(target, history.filter((flip) => observedAt() - flip.at <= 2_000));
      if (!isDiscoveryCandidate(flips.get(target) ?? [], observedAt(), small)) continue;
      const jsname = target.getAttribute("jsname");
      if (!jsname) continue;
      discovered = true;
      onDiscovered(`[jsname="${cssEscape(jsname)}"]`);
    }
  });

  const structureObserver = new MutationObserver(() => {
    onStructure();
    const tiles = doc.querySelectorAll(selectors().participant).length;
    if (tiles === 0) {
      tilesSince = null;
      return;
    }
    if (tilesSince == null) tilesSince = observedAt();
    const meters = doc.querySelectorAll(selectors().meter).length;
    if (!discovered && meters === 0 && tilesSince != null && observedAt() - tilesSince >= 30_000) {
      discoveryArmed = true;
    }
  });

  classObserver.observe(doc.body, { attributes: true, attributeFilter: ["class"], subtree: true });
  structureObserver.observe(doc.body, { childList: true, subtree: true });
  scan();

  return {
    stop() {
      classObserver.disconnect();
      structureObserver.disconnect();
    },
    meterCount: () => doc.querySelectorAll(selectors().meter).length,
    lastChangeAt: () => lastChange,
    usingDiscoveredSelector: () => discovered,
  };
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
