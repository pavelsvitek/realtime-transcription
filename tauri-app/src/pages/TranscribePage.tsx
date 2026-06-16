import { useState } from "react";
import { useTranscription } from "../hooks/useTranscription";
import { useMicLevel } from "../hooks/useMicLevel";
import { MicIndicator } from "../components/MicIndicator";
import { TranscriptFeed } from "../components/TranscriptFeed";
import type { AudioSource } from "../lib/transcript-types";

export function TranscribePage() {
  const [audioSource, setAudioSource] = useState<AudioSource>("system");
  const {
    segments,
    isActive,
    isLoading,
    error,
    model,
    models,
    selectedModelId,
    selectedModel,
    selectModel,
    start,
    stop,
    clear,
  } = useTranscription();
  const micActive = useMicLevel(isActive);

  return (
    <main className="page">
      <header className="page-header">
        <div className="header-left">
          <h1 className="page-title">Live Transcription</h1>
          {model && <span className="model-badge">{model}</span>}
        </div>
        <div className="header-controls">
          <label className="source-select">
            <span className="source-select-label">Model</span>
            <select
              value={selectedModelId ?? ""}
              onChange={(e) => selectModel(e.target.value)}
              disabled={isActive || isLoading || models.length === 0}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.available}>
                  {m.name}
                  {!m.available ? " (unavailable)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="source-select">
            <span className="source-select-label">Input</span>
            <select
              value={audioSource}
              onChange={(e) => setAudioSource(e.target.value as AudioSource)}
              disabled={isActive || isLoading}
            >
              <option value="system">Chrome / system audio</option>
              <option value="mic">Microphone</option>
              <option value="both">Mic + system</option>
            </select>
          </label>
          <MicIndicator
            isActive={isActive}
            micActive={micActive}
            error={error}
          />
          {!isActive ? (
            <button
              className="btn btn-start"
              onClick={() => start(audioSource)}
              disabled={isLoading || !selectedModel?.available}
            >
              {isLoading ? "Loading model..." : "Start"}
            </button>
          ) : (
            <button className="btn btn-stop" onClick={stop}>
              Stop
            </button>
          )}
          {segments.length > 0 && !isActive && (
            <button className="btn btn-clear" onClick={clear}>
              Clear
            </button>
          )}
        </div>
      </header>

      {selectedModel && !selectedModel.available && selectedModel.unavailableReason && (
        <div className="error-banner">
          {selectedModel.unavailableReason}
        </div>
      )}

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <TranscriptFeed segments={segments} />

      <footer className="page-footer">
        <span className="status-text">
          {isActive
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
