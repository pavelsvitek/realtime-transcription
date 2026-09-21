export type MeetingSelectionDirection = "up" | "down";

/** Move the keyboard cursor through the list. Arrows do not wrap. */
export function moveMeetingSelection(
  ids: readonly string[],
  selectedId: string | null,
  direction: MeetingSelectionDirection,
): string | null {
  if (ids.length === 0) return null;

  const index = selectedId == null ? -1 : ids.indexOf(selectedId);
  if (index === -1) {
    return direction === "down" ? ids[0] : ids[ids.length - 1];
  }

  const nextIndex = direction === "down" ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= ids.length) return ids[index];
  return ids[nextIndex];
}

/**
 * Keep the same meeting selected when the list changes.
 * If it disappeared, select the row that slid into its place, or the new last row.
 */
export function retainMeetingSelection(
  previousIds: readonly string[],
  nextIds: readonly string[],
  selectedId: string | null,
): string | null {
  if (selectedId == null) return null;
  if (nextIds.includes(selectedId)) return selectedId;
  if (nextIds.length === 0) return null;

  const oldIndex = previousIds.indexOf(selectedId);
  if (oldIndex === -1) return null;
  return nextIds[Math.min(oldIndex, nextIds.length - 1)] ?? null;
}
