import type { DeviceKind } from "../lib/transcript-types";
import { getMicrophoneTooltipLabel } from "../lib/audio-device-label";
import { MIC_MUTED_LABEL, micIndicatorState } from "../lib/mic-indicator";
import { Tooltip } from "./Tooltip";

type MicIndicatorProps = {
  isActive: boolean;
  micActive: boolean;
  /** Muted in the meeting app: Amie records silence for the mic. */
  micMuted: boolean;
  error: string | null;
  deviceName: string | null;
  deviceKind: DeviceKind | null;
  deviceError: string | null;
};

const BLUETOOTH_HEADSET_KINDS: DeviceKind[] = [
  "bluetoothEarbuds",
  "bluetoothHeadphones",
  "bluetoothGeneric",
];

const MIC_COLORS = {
  error: "#ef4444",
  recording: "#ef4444",
  // Amber, not red: red means "recording you", muted means the opposite.
  muted: "#f59e0b",
  idle: "#9ca3af",
} as const;

function isBluetoothHeadset(kind: DeviceKind | null): boolean {
  return kind !== null && BLUETOOTH_HEADSET_KINDS.includes(kind);
}

export function MicIndicator({
  isActive,
  micActive,
  micMuted,
  error,
  deviceName,
  deviceKind,
  deviceError,
}: MicIndicatorProps) {
  const state = micIndicatorState({ isActive, micActive, micMuted, error });
  const color = MIC_COLORS[state];

  const label =
    state === "muted"
      ? MIC_MUTED_LABEL
      : getMicrophoneTooltipLabel(deviceName, deviceKind, deviceError);
  const showHeadphones = isBluetoothHeadset(deviceKind);

  return (
    <Tooltip content={label}>
      <span className="mic-indicator" tabIndex={0}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, transition: "stroke 0.15s ease", display: "block" }}
          aria-hidden="true"
        >
          {state === "muted" ? (
            <>
              {/* The mic with a diagonal cut through it, so the slash reads at 20px. */}
              <defs>
                <mask id="mic-muted-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                  <rect width="24" height="24" fill="white" />
                  <line x1="5" x2="19" y1="3" y2="21" stroke="black" strokeWidth="5" />
                </mask>
              </defs>
              <g mask="url(#mic-muted-cut)">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </g>
              <line x1="5" x2="19" y1="3" y2="21" />
            </>
          ) : showHeadphones ? (
            <>
              <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
              <path d="M4 14a2 2 0 0 0 2 2h1v-4H5a1 1 0 0 0-1 1z" />
              <path d="M20 14a2 2 0 0 1-2 2h-1v-4h1a1 1 0 0 1 1 1z" />
            </>
          ) : (
            <>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </>
          )}
        </svg>
      </span>
    </Tooltip>
  );
}
