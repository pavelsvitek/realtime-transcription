import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AsrSettings } from "../lib/transcript-types";

const KEY_MASK = "•".repeat(24);

export function SettingsPage() {
  const [settings, setSettings] = useState<AsrSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<AsrSettings>("get_asr_settings");
      setSettings(next);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const keyIsSet = Boolean(settings?.xaiApiKeySet);
  const fieldLocked = keyIsSet;

  const saveKey = async () => {
    if (fieldLocked) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await invoke("set_xai_api_key", { key: apiKey });
      setApiKey("");
      setStatus("xAI API key saved.");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await invoke("clear_xai_api_key");
      setApiKey("");
      setStatus("Saved xAI API key cleared.");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const keyState = settings
    ? [
        settings.xaiApiKeyFromEnv ? "env" : null,
        settings.xaiApiKeySaved ? "saved locally" : null,
      ]
        .filter(Boolean)
        .join(" + ") || "Not set"
    : "Loading…";

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
      </header>

      <section className="settings-section">
        <h2 className="settings-heading">xAI Transcribe 2.0</h2>
        <p className="settings-copy">
          Used when ASR is set to <strong>xAI Transcribe 2.0</strong> on the New chat page.
          Live sessions pin <code>grok-voice-transcribe-2.0</code>. The key is stored under
          Application Support (or taken from <code>XAI_API_KEY</code>).
        </p>

        <div className="settings-row">
          <span className="settings-label">Status</span>
          <span className="settings-value">{keyState}</span>
        </div>

        <label className="settings-field">
          <span className="settings-label">API key</span>
          <input
            type="password"
            className="settings-input"
            value={fieldLocked ? KEY_MASK : apiKey}
            onChange={(e) => {
              if (!fieldLocked) setApiKey(e.target.value);
            }}
            placeholder="xai-…"
            disabled={fieldLocked || saving}
            readOnly={fieldLocked}
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
          />
        </label>

        <div className="settings-actions">
          <button
            className="btn btn-start"
            onClick={() => void saveKey()}
            disabled={saving || fieldLocked || apiKey.trim().length === 0}
          >
            {saving ? "Saving…" : "Save key"}
          </button>
          <button
            className="btn btn-clear"
            onClick={() => void clearKey()}
            disabled={saving || !settings?.xaiApiKeySaved}
          >
            Clear saved key
          </button>
        </div>

        {fieldLocked && settings?.xaiApiKeySaved && (
          <p className="settings-copy">
            Clear the saved key to enter a new one. The real key is never shown.
          </p>
        )}
        {fieldLocked && settings?.xaiApiKeyFromEnv && !settings.xaiApiKeySaved && (
          <p className="settings-copy">
            Key is provided by <code>XAI_API_KEY</code> and cannot be edited here.
          </p>
        )}

        {status && <div className="settings-status">{status}</div>}
        {error && <div className="error-banner">{error}</div>}
      </section>
    </main>
  );
}
