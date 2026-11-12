import type {
  AudioDeviceChoice,
  AudioDeviceEntry,
  AudioDeviceList,
} from "./transcript-types";

export const SYSTEM_DEFAULT_LABEL = "System default";
export const DEVICE_CHOICE_STORAGE_KEY = "amie.audioDevices";

export type DeviceMenuRow = {
  /** `null` is the "System default" row. */
  id: string | null;
  label: string;
  selected: boolean;
};

/** A saved device that is no longer plugged in counts as the system default. */
export function effectiveChoice(
  choice: string | null,
  devices: AudioDeviceEntry[],
): string | null {
  return choice !== null && devices.some((d) => d.id === choice) ? choice : null;
}

export function buildDeviceRows(
  devices: AudioDeviceEntry[],
  defaultId: string | null,
  choice: string | null,
): DeviceMenuRow[] {
  const active = effectiveChoice(choice, devices);
  const defaultName = devices.find((d) => d.id === defaultId)?.name;
  return [
    {
      id: null,
      label: defaultName ? `${SYSTEM_DEFAULT_LABEL} (${defaultName})` : SYSTEM_DEFAULT_LABEL,
      selected: active === null,
    },
    ...devices.map((d) => ({ id: d.id, label: d.name, selected: d.id === active })),
  ];
}

/** Name of the device that is actually in use for a side of the call. */
export function activeDeviceName(
  devices: AudioDeviceEntry[],
  defaultId: string | null,
  choice: string | null,
): string | null {
  const id = effectiveChoice(choice, devices) ?? defaultId;
  return devices.find((d) => d.id === id)?.name ?? null;
}

export function parseStoredChoice(raw: string | null): AudioDeviceChoice {
  const empty: AudioDeviceChoice = { input: null, output: null };
  if (!raw) return empty;
  try {
    const value = JSON.parse(raw) as Partial<AudioDeviceChoice>;
    return {
      input: typeof value.input === "string" ? value.input : null,
      output: typeof value.output === "string" ? value.output : null,
    };
  } catch {
    return empty;
  }
}

export function emptyDeviceList(): AudioDeviceList {
  return { inputs: [], outputs: [], defaultInputId: null, defaultOutputId: null };
}
