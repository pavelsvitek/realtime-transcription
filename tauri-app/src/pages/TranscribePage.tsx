import { useTranscription } from "../hooks/useTranscription";
import { useMicLevel } from "../hooks/useMicLevel";
import { MicIndicator } from "../components/MicIndicator";
import { TranscriptFeed } from "../components/TranscriptFeed";

export function TranscribePage() {
  const { segments, isActive, isLoading, error, model, start, stop, clear } =
    useTranscription();
  const micActive = useMicLevel(isActive);

  return (
    <main className="page">
      <header className="page-header">
        <div className="header-left">
          <h1 className="page-title">Live Transcription</h1>
          {model && <span className="model-badge">{model}</span>}
        </div>
        <div className="header-controls">
          <MicIndicator
            isActive={isActive}
            micActive={micActive}
            error={error}
          />
          {!isActive ? (
            <button
              className="btn btn-start"
              onClick={start}
              disabled={isLoading}
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

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <TranscriptFeed segments={segments} />

      <footer className="page-footer">
        <span className="status-text">
          {isActive
            ? "Listening..."
            : segments.length > 0
              ? `${segments.filter((s) => !s.isPartial).length} segments`
              : "Ready"}
        </span>
      </footer>
    </main>
  );
}
