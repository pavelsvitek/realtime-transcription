import { useEffect, useId, useRef, useState } from "react";
import { buildDeviceRows, type DeviceMenuRow } from "../lib/audio-device-menu";
import type { AudioDeviceEntry } from "../lib/transcript-types";
import { cn } from "../lib/cn";
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
    <div
      className="not-first:mt-1.5 not-first:border-t not-first:border-border-input not-first:pt-1.5"
      role="group"
      aria-label={title}
    >
      <div className="px-2 py-1 text-[11px] font-semibold tracking-[0.04em] text-text-secondary uppercase">
        {title}
      </div>
      {rows.map((row) => (
        <button
          key={row.id ?? "default"}
          type="button"
          role="menuitemradio"
          aria-checked={row.selected}
          className={cn(
            "flex w-full cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-2 py-1.5 text-left font-[family-name:inherit] text-[13px] text-text-primary hover:bg-surface-hover",
            row.selected && "font-semibold",
          )}
          onClick={() => onChoose(row.id)}
        >
          <span className="w-3.5 shrink-0 text-text-brand" aria-hidden="true">
            {row.selected ? "✓" : ""}
          </span>
          <span className="truncate">{row.label}</span>
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
    <span className="relative -ml-1 inline-flex items-center" ref={rootRef}>
      <Tooltip content="Choose microphone and speakers">
        <button
          type="button"
          className="inline-flex h-6 w-5 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 text-text-secondary hover:bg-surface-hover hover:text-text-primary aria-expanded:bg-surface-hover aria-expanded:text-text-primary"
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
        <div
          className="absolute top-[calc(100%+8px)] right-0 z-[1000] max-h-[70vh] w-80 overflow-y-auto rounded-[10px] border border-border-input bg-surface-elevated p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          id={menuId}
          role="menu"
        >
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
          {error && (
            <div className="mt-1.5 px-2 py-1.5 text-[12px] text-status-danger" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
