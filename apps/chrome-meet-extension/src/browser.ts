/** Google Meet extension speaker-tracking — Chrome vs Brave label for `meet_bridge` hello. */

type BraveNavigator = {
  brave?: { isBrave?: () => Promise<boolean> };
};

export async function detectBrowser(
  nav: BraveNavigator = navigator as BraveNavigator,
): Promise<"brave" | "chrome"> {
  try {
    if (await nav.brave?.isBrave?.()) return "brave";
  } catch {
    return "chrome";
  }
  return "chrome";
}
