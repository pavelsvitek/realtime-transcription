/** Google Meet extension speaker-tracking — DOM hooks for Meet level meters (not speaking-class names). */

export type Selectors = {
  participant: string;
  meter: string;
  name: string;
  panelRow: string;
};

export const DEFAULT_SELECTORS: Selectors = {
  participant: "[data-participant-id]",
  meter: '[jsname="QgSmzd"]',
  name: "span.notranslate",
  panelRow: '[data-participant-id][role="listitem"]',
};

export function selectorsFromOverride(override: {
  participant: string;
  meter: string;
  name: string;
  panel_row: string;
}): Selectors {
  return {
    participant: override.participant,
    meter: override.meter,
    name: override.name,
    panelRow: override.panel_row,
  };
}
