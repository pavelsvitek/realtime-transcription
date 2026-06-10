import { useHotkeys } from "@tanstack/react-hotkeys";
import {
  SEEK_STEP_MS,
  type ReplayDriver,
} from "@/lib/replay/replay-driver";
import {
  stepReplaySpeedDown,
  stepReplaySpeedUp,
} from "@/lib/replay/replay-speed";

type UseReplayHotkeysOptions = {
  driver: ReplayDriver | null;
  enabled?: boolean;
};

export function useReplayHotkeys({
  driver,
  enabled = true,
}: UseReplayHotkeysOptions): void {
  const isActive = enabled && driver !== null;

  useHotkeys(
    [
      {
        hotkey: "Space",
        callback: () => {
          if (!driver) return;
          const { playing } = driver.getState();
          if (playing) driver.pause();
          else driver.play();
        },
        options: { preventDefault: true },
      },
      {
        hotkey: "Mod+Backspace",
        callback: () => {
          driver?.reset();
        },
        options: { preventDefault: true },
      },
      {
        hotkey: "ArrowUp",
        callback: () => {
          if (!driver) return;
          const next = stepReplaySpeedUp(driver.getState().speed);
          if (next !== null) driver.setSpeed(next);
        },
        options: { preventDefault: true },
      },
      {
        hotkey: "ArrowDown",
        callback: () => {
          if (!driver) return;
          const next = stepReplaySpeedDown(driver.getState().speed);
          if (next !== null) driver.setSpeed(next);
        },
        options: { preventDefault: true },
      },
      {
        hotkey: "ArrowLeft",
        callback: () => {
          driver?.seekBy(-SEEK_STEP_MS);
        },
        options: { preventDefault: true },
      },
      {
        hotkey: "ArrowRight",
        callback: () => {
          driver?.seekBy(SEEK_STEP_MS);
        },
        options: { preventDefault: true },
      },
    ],
    { enabled: isActive },
  );
}
