import { useHotkeys } from "@tanstack/react-hotkeys";
import type { AppPage } from "../components/Sidebar";
import { NAV_HOTKEYS } from "../lib/nav-hotkeys";

export function useNavHotkeys(
  onNavigate: (page: AppPage) => void,
  enabled = true,
) {
  useHotkeys(
    NAV_HOTKEYS.map((item) => ({
      hotkey: item.hotkey,
      callback: () => onNavigate(item.page),
      options: {
        enabled,
        meta: {
          name: item.label,
          description: `Go to ${item.label}`,
        },
      },
    })),
  );
}
