import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AsrSettings,
  SpeakerTagsStatus,
  SummaryProvider,
  SummarySettings,
} from "../lib/transcript-types";
import { summaryProviderHasKey } from "../lib/summary-providers";

const KEY_MASK = "•".repeat(24);

const PROVIDERS: { id: SummaryProvider; label: string }[] = [
  { id: "xai", label: "xAI" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<AsrSettings | null>(null);
  const [summarySettings, setSummarySettings] = useState<SummarySettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [speakerStatus, setSpeakerStatus] = useState<SpeakerTagsStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [next, summary, speakers] = await Promise.all([
        invoke<AsrSettings>("get_asr_settings"),
        invoke<SummarySettings>("get_summary_settings"),
        invoke<SpeakerTagsStatus>("get_speaker_tags_status"),
      ]);
      setSettings(next);
      setSummarySettings(summary);
      setSpeakerStatus(speakers);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const keyIsSet = Boolean(settings?.xaiApiKeySet);
  const fieldLocked = keyIsSet;

  const saveKey = async () => {
    if (fieldLocked) return;
    await run(async () => {
      await invoke("set_xai_api_key", { key: apiKey });
      setApiKey("");
      setStatus("xAI API key saved.");
    });
  };

  const clearKey = async () => {
    await run(async () => {
      await invoke("clear_xai_api_key");
      setApiKey("");
      setStatus("Saved xAI API key cleared.");
    });
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

      <div className="settings-scroll">
        <section className="settings-section">
          <h2 className="settings-heading">Speaker names</h2>
          <p className="settings-copy">
            Reads who Zoom or Teams shows as speaking. Does not record the screen.
          </p>
          <div className="settings-row">
            <span className="settings-label">Accessibility</span>
            <span className="settings-value">
              {speakerStatus ? (speakerStatus.trusted ? "On" : "Off") : "Loading…"}
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-label">This build</span>
            <span className="settings-value">
              {speakerStatus?.buildLabel ?? "Loading…"}
            </span>
          </div>
          {speakerStatus?.bundlePath && (
            <p className="settings-copy">{speakerStatus.bundlePath}</p>
          )}
          {speakerStatus?.meetingApp === "zoom" && (
            <p className="settings-copy">Zoom is open.</p>
          )}
          {speakerStatus?.meetingApp === "teams" && (
            <p className="settings-copy">Microsoft Teams is open.</p>
          )}
          <div className="settings-actions">
            <button
              className="btn btn-start"
              onClick={() =>
                void run(async () => {
                  await invoke("request_accessibility_permission");
                  const label = speakerStatus?.buildLabel ?? "this Amie build";
                  setStatus(
                    `System Settings is open on the Accessibility list. Turn on ${label}.`,
                  );
                })
              }
              disabled={saving || speakerStatus?.trusted === true}
            >
              Allow Accessibility
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-heading">Meeting summaries</h2>
          <p className="settings-copy">
            Choose which model writes the meeting title and summary. xAI stays the default.
            <code>SUMMARY_LLM_PROVIDER</code> overrides this choice.
          </p>
          <label className="settings-field">
            <span className="settings-label">Provider</span>
            <select
              className="settings-input"
              value={summarySettings?.provider ?? "xai"}
              disabled={saving || !summarySettings || summarySettings.providerFromEnv}
              onChange={(e) => {
                const provider = e.target.value;
                if (!summaryProviderHasKey(provider, settings, summarySettings)) return;
                void run(async () => {
                  await invoke("set_summary_provider", { provider });
                  setStatus(`Summary provider set to ${providerLabel(provider)}.`);
                });
              }}
            >
              {PROVIDERS.map((provider) => {
                const hasKey = summaryProviderHasKey(provider.id, settings, summarySettings);
                return (
                  <option key={provider.id} value={provider.id} disabled={!hasKey}>
                    {provider.label}
                    {settings && summarySettings && !hasKey ? " (no API key)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          {summarySettings?.providerFromEnv && (
            <p className="settings-copy">
              Provider is set by <code>SUMMARY_LLM_PROVIDER</code> and cannot be edited here.
            </p>
          )}
        </section>

        <section className="settings-section">
          <h2 className="settings-heading">xAI Transcribe 2.0</h2>
          <p className="settings-copy">
            Used when ASR is set to <strong>xAI Transcribe 2.0</strong> on the New chat page.
            Live sessions pin <code>grok-voice-transcribe-2.0</code>. The key is stored under
            Application Support (or taken from <code>XAI_API_KEY</code>). Meeting summaries use
            this same key when the summary provider is xAI.
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
        </section>

        <SummaryKeySection
          title="OpenAI"
          copy={
            <>
              Used for meeting summaries when the provider is <strong>OpenAI</strong>. The key is
              stored under Application Support (or taken from <code>OPENAI_API_KEY</code>).
            </>
          }
          placeholder="sk-…"
          envName="OPENAI_API_KEY"
          value={openaiKey}
          onChange={setOpenaiKey}
          loaded={summarySettings !== null}
          keyIsSet={Boolean(summarySettings?.openaiApiKeySet)}
          keySaved={Boolean(summarySettings?.openaiApiKeySaved)}
          keyFromEnv={Boolean(summarySettings?.openaiApiKeyFromEnv)}
          saving={saving}
          onSave={() =>
            void run(async () => {
              await invoke("set_openai_api_key", { key: openaiKey });
              setOpenaiKey("");
              setStatus("OpenAI API key saved.");
            })
          }
          onClear={() =>
            void run(async () => {
              await invoke("clear_openai_api_key");
              setOpenaiKey("");
              setStatus("Saved OpenAI API key cleared.");
            })
          }
        />

        <SummaryKeySection
          title="Gemini"
          copy={
            <>
              Used for meeting summaries when the provider is <strong>Gemini</strong>. The key is
              stored under Application Support (or taken from <code>GEMINI_API_KEY</code> or{" "}
              <code>GOOGLE_API_KEY</code>).
            </>
          }
          placeholder="AIza…"
          envName="GEMINI_API_KEY"
          value={geminiKey}
          onChange={setGeminiKey}
          loaded={summarySettings !== null}
          keyIsSet={Boolean(summarySettings?.geminiApiKeySet)}
          keySaved={Boolean(summarySettings?.geminiApiKeySaved)}
          keyFromEnv={Boolean(summarySettings?.geminiApiKeyFromEnv)}
          saving={saving}
          onSave={() =>
            void run(async () => {
              await invoke("set_gemini_api_key", { key: geminiKey });
              setGeminiKey("");
              setStatus("Gemini API key saved.");
            })
          }
          onClear={() =>
            void run(async () => {
              await invoke("clear_gemini_api_key");
              setGeminiKey("");
              setStatus("Saved Gemini API key cleared.");
            })
          }
        />

        {status && (
          <section className="settings-section">
            <div className="settings-status">{status}</div>
          </section>
        )}
        {error && (
          <section className="settings-section">
            <div className="error-banner">{error}</div>
          </section>
        )}
      </div>
    </main>
  );
}

function providerLabel(id: string): string {
  return PROVIDERS.find((provider) => provider.id === id)?.label ?? id;
}

function keyStatus(fromEnv: boolean, saved: boolean, loaded: boolean): string {
  if (!loaded) return "Loading…";
  return (
    [fromEnv ? "env" : null, saved ? "saved locally" : null].filter(Boolean).join(" + ") || "Not set"
  );
}

function SummaryKeySection({
  title,
  copy,
  placeholder,
  envName,
  value,
  onChange,
  loaded,
  keyIsSet,
  keySaved,
  keyFromEnv,
  saving,
  onSave,
  onClear,
}: {
  title: string;
  copy: ReactNode;
  placeholder: string;
  envName: string;
  value: string;
  onChange: (value: string) => void;
  loaded: boolean;
  keyIsSet: boolean;
  keySaved: boolean;
  keyFromEnv: boolean;
  saving: boolean;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <section className="settings-section">
      <h2 className="settings-heading">{title}</h2>
      <p className="settings-copy">{copy}</p>

      <div className="settings-row">
        <span className="settings-label">Status</span>
        <span className="settings-value">{keyStatus(keyFromEnv, keySaved, loaded)}</span>
      </div>

      <label className="settings-field">
        <span className="settings-label">API key</span>
        <input
          type="password"
          className="settings-input"
          value={keyIsSet ? KEY_MASK : value}
          onChange={(e) => {
            if (!keyIsSet) onChange(e.target.value);
          }}
          placeholder={placeholder}
          disabled={keyIsSet || saving}
          readOnly={keyIsSet}
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
        />
      </label>

      <div className="settings-actions">
        <button
          className="btn btn-start"
          onClick={onSave}
          disabled={saving || keyIsSet || value.trim().length === 0}
        >
          {saving ? "Saving…" : "Save key"}
        </button>
        <button className="btn btn-clear" onClick={onClear} disabled={saving || !keySaved}>
          Clear saved key
        </button>
      </div>

      {keyIsSet && keySaved && (
        <p className="settings-copy">
          Clear the saved key to enter a new one. The real key is never shown.
        </p>
      )}
      {keyIsSet && keyFromEnv && !keySaved && (
        <p className="settings-copy">
          Key is provided by <code>{envName}</code> and cannot be edited here.
        </p>
      )}
    </section>
  );
}
