import { useState } from "react";
import { MicIndicator } from "../components/MicIndicator";
import { Spinner } from "../components/Spinner";
import { TranscriptFeed } from "../components/TranscriptFeed";
import { useAudioDevice } from "../hooks/useAudioDevice";
import { useMicLevel } from "../hooks/useMicLevel";
import { useTranscription } from "../hooks/useTranscription";
import type { AudioSource } from "../lib/transcript-types";

export function TranscribePage() {
  const [audioSource, setAudioSource] = useState<AudioSource>("both");
  const {
    segments,
    isActive,
    isLoading,
    isStopping,
    error,
    model,
    start,
    stop,
    clear,
  } = useTranscription();
  const { device, error: deviceError } = useAudioDevice();
  const micActive = useMicLevel(isActive && !isStopping);

  return (
    <main className="page">
      <header className="page-header">
        <div className="header-left">
          <h1 className="page-title">New chat</h1>
          {model && <span className="model-badge">{model}</span>}
        </div>
        <div className="header-controls">
          <label className="source-select">
            <span className="source-select-label">Input</span>
            <select
              value={audioSource}
              onChange={(e) => setAudioSource(e.target.value as AudioSource)}
              disabled={isActive || isLoading || isStopping}
            >
              <option value="system">Chrome / system audio</option>
              <option value="mic">Microphone</option>
              <option value="both">Mic + system</option>
            </select>
          </label>
          <MicIndicator
            isActive={isActive && !isStopping}
            micActive={micActive}
            error={error}
            deviceName={device?.name ?? null}
            deviceKind={device?.kind ?? null}
            deviceError={deviceError}
          />
          {!isActive ? (
            <button
              className="btn btn-start"
              onClick={() => start(audioSource)}
              disabled={isLoading}
            >
              {isLoading ? "Loading model..." : "Start"}
            </button>
          ) : (
            <button
              className="btn btn-stop"
              onClick={stop}
              disabled={isStopping}
              aria-busy={isStopping}
              aria-label={isStopping ? "Stopping transcription" : "Stop transcription"}
            >
              {isStopping ? <Spinner className="btn-spinner" /> : "Stop"}
            </button>
          )}
          {segments.length > 0 && !isActive && (
            <button className="btn btn-clear" onClick={clear}>
              Clear
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <TranscriptFeed
        segments={segments}
        audioSource={audioSource}
        deviceName={device?.name ?? null}
        deviceKind={device?.kind ?? null}
      />

      <footer className="page-footer">
        <span className="status-text">
          {isStopping
            ? "Stopping..."
            : isActive
            ? audioSource === "both"
              ? "Capturing mic + system audio..."
              : audioSource === "system"
                ? "Capturing Chrome audio..."
                : "Listening..."
            : segments.length > 0
              ? `${segments.filter((s) => !s.isPartial).length} segments`
              : "Ready"}
        </span>
      </footer>
    </main>
  );
}
