import { useHotkeys } from "@tanstack/react-hotkeys";
import type { AppPage } from "../components/Sidebar";
import { NAV_HOTKEYS, NAV_HOTKEY_OPTIONS } from "../lib/nav-hotkeys";

export function useNavHotkeys(onNavigate: (page: AppPage) => void) {
  useHotkeys(
    NAV_HOTKEYS.map((item) => ({
      hotkey: item.hotkey,
      callback: () => onNavigate(item.page),
      options: {
        meta: {
          name: item.label,
          description: `Go to ${item.label}`,
          group: "Navigation",
        },
      },
    })),
    NAV_HOTKEY_OPTIONS,
  );
}
