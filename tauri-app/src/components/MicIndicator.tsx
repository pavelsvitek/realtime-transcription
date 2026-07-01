import type { DeviceKind } from "../lib/transcript-types";
import { getMicrophoneTooltipLabel } from "../lib/audio-device-label";
import { Tooltip } from "./Tooltip";

type MicIndicatorProps = {
  isActive: boolean;
  micActive: boolean;
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

function isBluetoothHeadset(kind: DeviceKind | null): boolean {
  return kind !== null && BLUETOOTH_HEADSET_KINDS.includes(kind);
}

export function MicIndicator({
  isActive,
  micActive,
  error,
  deviceName,
  deviceKind,
  deviceError,
}: MicIndicatorProps) {
  let color: string;
  if (error) {
    color = "#ef4444";
  } else if (isActive && micActive) {
    color = "#ef4444";
  } else {
    color = "#9ca3af";
  }

  const label = getMicrophoneTooltipLabel(deviceName, deviceKind, deviceError);
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
          {showHeadphones ? (
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
