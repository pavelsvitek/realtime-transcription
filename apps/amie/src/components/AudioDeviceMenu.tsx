import { useEffect, useId, useRef, useState } from "react";
import { buildDeviceRows, type DeviceMenuRow } from "../lib/audio-device-menu";
import type { AudioDeviceEntry } from "../lib/transcript-types";
import { Tooltip } from "./Tooltip";

type AudioDeviceMenuProps = {
  inputs: AudioDeviceEntry[];
  outputs: AudioDeviceEntry[];
  defaultInputId: string | null;
  defaultOutputId: string | null;
  inputChoice: string | null;
  outputChoice: string | null;
  /** Mic section is only relevant when the source records the microphone. */
  showInput: boolean;
  /** Speaker section is only relevant when the source records system audio. */
  showOutput: boolean;
  error: string | null;
  onChooseInput: (id: string | null) => void;
  onChooseOutput: (id: string | null) => void;
  onOpen: () => void;
};

function Section({
  title,
  rows,
  onChoose,
}: {
  title: string;
  rows: DeviceMenuRow[];
  onChoose: (id: string | null) => void;
}) {
  return (
    <div className="audio-menu-section" role="group" aria-label={title}>
      <div className="audio-menu-heading">{title}</div>
      {rows.map((row) => (
        <button
          key={row.id ?? "default"}
          type="button"
          role="menuitemradio"
          aria-checked={row.selected}
          className={`audio-menu-row${row.selected ? " audio-menu-row-selected" : ""}`}
          onClick={() => onChoose(row.id)}
        >
          <span className="audio-menu-check" aria-hidden="true">
            {row.selected ? "✓" : ""}
          </span>
          <span className="audio-menu-label">{row.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Chevron next to the mic icon, like Google Meet's audio settings. */
export function AudioDeviceMenu({
  inputs,
  outputs,
  defaultInputId,
  defaultOutputId,
  inputChoice,
  outputChoice,
  showInput,
  showOutput,
  error,
  onChooseInput,
  onChooseOutput,
  onOpen,
}: AudioDeviceMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (!open) onOpen();
    setOpen((value) => !value);
  };

  return (
    <span className="audio-menu" ref={rootRef}>
      <Tooltip content="Choose microphone and speakers">
        <button
          type="button"
          className="audio-menu-trigger"
          aria-label="Choose microphone and speakers"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={toggle}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <div className="audio-menu-popover" id={menuId} role="menu">
          {showInput && (
            <Section
              title="Microphone"
              rows={buildDeviceRows(inputs, defaultInputId, inputChoice)}
              onChoose={onChooseInput}
            />
          )}
          {showOutput && (
            <Section
              title="Speakers (call audio)"
              rows={buildDeviceRows(outputs, defaultOutputId, outputChoice)}
              onChoose={onChooseOutput}
            />
          )}
          {error && <div className="audio-menu-error" role="alert">{error}</div>}
        </div>
      )}
    </span>
  );
}
