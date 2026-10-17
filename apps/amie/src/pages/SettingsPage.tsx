import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { invoke } from "@tauri-apps/api/core";
import type { AsrSettings, SummaryProvider, SummarySettings } from "../lib/transcript-types";
import { summaryProviderHasKey } from "../lib/summary-providers";
import { useSpeakerTagsStatus } from "../hooks/useSpeakerTagsStatus";
import { signatureLabel } from "../lib/speaker-tags";
import { moveSettingsSection } from "../lib/nav-hotkeys";

const KEY_MASK = "•".repeat(24);

const PROVIDERS: { id: SummaryProvider; label: string }[] = [
  { id: "xai", label: "xAI" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
];

type SettingsSection = "meeting-summary" | "mcp" | "system-access";

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: "meeting-summary", label: "Meeting summary" },
  { id: "mcp", label: "MCP" },
  { id: "system-access", label: "System access" },
];

const SECTION_IDS = NAV_ITEMS.map((item) => item.id);

type MicrophoneAuthorization =
  | "notDetermined"
  | "restricted"
  | "denied"
  | "authorized"
  | "unknown";

type SystemAccessStatus = {
  microphone: MicrophoneAuthorization;
  systemAudio: "reviewInSettings";
  accessibility: {
    trusted: boolean;
    buildLabel: string;
    bundleId?: string | null;
    bundlePath?: string | null;
    meetingApp?: string | null;
    signature?: string;
    signer?: string | null;
  };
};

type McpStatus = {
  binaryFound: boolean;
  binaryPath: string | null;
  claudeCommand: string;
  cursorConfig: string;
  codexConfig: string;
};

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const [section, setSection] = useState<SettingsSection>("meeting-summary");
  const [settings, setSettings] = useState<AsrSettings | null>(null);
  const [summarySettings, setSummarySettings] = useState<SummarySettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [systemAccess, setSystemAccess] = useState<SystemAccessStatus | null>(null);
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [openingPane, setOpeningPane] = useState<string | null>(null);
  const { status: speakerStatus } = useSpeakerTagsStatus();

  const selectSection = useCallback((next: SettingsSection) => {
    setSection(next);
    setStatus(null);
    setError(null);
  }, []);

  useHotkey(
    "Escape",
    (event) => {
      event.preventDefault();
      onBack();
    },
    {
      preventDefault: true,
      meta: {
        name: "Leave Settings",
        description: "Go back to the previous page",
      },
    },
  );

  const moveSection = useCallback((direction: "up" | "down") => {
    setSection((current) => moveSettingsSection(SECTION_IDS, current, direction));
    setStatus(null);
    setError(null);
  }, []);

  // Capture-phase: Cmd+Arrow is often swallowed by WKWebView before React hotkeys.
  // Plain Arrow also moves sections (same pattern as Meetings), except inside fields.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

      const target = event.target;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (inField && !event.metaKey && !event.ctrlKey) return;

      event.preventDefault();
      event.stopPropagation();
      moveSection(event.key === "ArrowDown" ? "down" : "up");
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [moveSection]);

  const refresh = useCallback(async () => {
    try {
      const [next, summary] = await Promise.all([
        invoke<AsrSettings>("get_asr_settings"),
        invoke<SummarySettings>("get_summary_settings"),
      ]);
      setSettings(next);
      setSummarySettings(summary);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshSystemAccess = useCallback(async () => {
    try {
      const next = await invoke<SystemAccessStatus>("get_system_access_status");
      setSystemAccess(next);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshMcp = useCallback(async () => {
    try {
      const next = await invoke<McpStatus>("get_mcp_status");
      setMcp(next);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (section === "system-access") void refreshSystemAccess();
    if (section === "mcp") void refreshMcp();
  }, [section, refreshSystemAccess, refreshMcp]);

  useEffect(() => {
    if (section !== "system-access") return;
    const onFocus = () => void refreshSystemAccess();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [section, refreshSystemAccess]);

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

  const openAccessPane = async (pane: "microphone" | "systemAudio" | "accessibility") => {
    setOpeningPane(pane);
    setStatus(null);
    setError(null);
    try {
      const next = await invoke<SystemAccessStatus>("open_system_access_settings", { pane });
      setSystemAccess(next);
      if (pane === "microphone") {
        setStatus("System Settings is open on Microphone. Enable Amie, then return here.");
      } else if (pane === "systemAudio") {
        setStatus(
          "System Settings is open on System Audio Recording. Enable Amie, then quit and reopen if capture was silent.",
        );
      } else {
        setStatus(
          `System Settings is open on the Accessibility list. Turn on ${
            next.accessibility.buildLabel || "this Amie build"
          }.`,
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setOpeningPane(null);
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

  const axTrusted = systemAccess?.accessibility.trusted ?? speakerStatus?.trusted;
  const axLabel = systemAccess?.accessibility.buildLabel ?? speakerStatus?.buildLabel;

  return (
    <main className="page settings-page">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <div className="settings-nav-chrome" data-tauri-drag-region aria-hidden="true" />
          <div className="settings-nav-header">
            <button
              type="button"
              className="settings-back"
              onClick={onBack}
              aria-label="Back"
            >
              <BackIcon />
              <span>Settings</span>
            </button>
          </div>
          <ul className="settings-nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={
                    section === item.id
                      ? "settings-nav-item settings-nav-item--active"
                      : "settings-nav-item"
                  }
                  aria-current={section === item.id ? "page" : undefined}
                  onClick={() => selectSection(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="settings-pane">
          <div className="settings-scroll">
            {section === "meeting-summary" && (
              <>
                <section className="settings-section">
                  <h2 className="settings-pane-title">Meeting summary</h2>
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
              </>
            )}

            {section === "mcp" && (
              <section className="settings-section">
                <h2 className="settings-pane-title">MCP</h2>
                <p className="settings-copy">
                  Connect Claude, Cursor, or Codex so they can use your Amie meetings on this Mac.
                  Open Amie at least once before connecting.
                </p>

                <div className="settings-row">
                  <span className="settings-label">Status</span>
                  <span className="settings-value">
                    {mcp
                      ? mcp.binaryFound
                        ? "Ready"
                        : "Amie MCP isn’t available in this build yet"
                      : "Loading…"}
                  </span>
                </div>

                <h3 className="settings-heading">Claude</h3>
                <p className="settings-copy">Run in Terminal, then restart Claude Code:</p>
                <pre className="settings-code">{mcp?.claudeCommand ?? "Loading…"}</pre>

                <h3 className="settings-heading">Cursor</h3>
                <p className="settings-copy">
                  Add this to <code>~/.cursor/mcp.json</code>, then reload MCP servers:
                </p>
                <pre className="settings-code">{mcp?.cursorConfig ?? "Loading…"}</pre>

                <h3 className="settings-heading">Codex</h3>
                <p className="settings-copy">
                  Add this to <code>~/.codex/config.toml</code>, then restart Codex:
                </p>
                <pre className="settings-code">{mcp?.codexConfig ?? "Loading…"}</pre>
              </section>
            )}

            {section === "system-access" && (
              <section className="settings-section">
                <h2 className="settings-pane-title">System access</h2>
                <p className="settings-copy">
                  Amie needs these macOS permissions for live capture and speaker names. Each build
                  (Amie vs Amie Dev) has its own row in System Settings.
                </p>

                <div className="settings-access-card">
                  <div className="settings-access-card-main">
                    <h3 className="settings-heading">Microphone</h3>
                    <p className="settings-copy">Used when the input source includes the mic.</p>
                    <div className="settings-row">
                      <span className="settings-label">Status</span>
                      <span className="settings-value">
                        {systemAccess
                          ? microphoneLabel(systemAccess.microphone)
                          : "Loading…"}
                      </span>
                    </div>
                  </div>
                  <div className="settings-actions">
                    <button
                      className="btn btn-start"
                      disabled={
                        openingPane !== null ||
                        systemAccess?.microphone === "authorized"
                      }
                      onClick={() => void openAccessPane("microphone")}
                    >
                      {openingPane === "microphone"
                        ? "Opening…"
                        : systemAccess?.microphone === "authorized"
                          ? "Allowed"
                          : "Enable Microphone"}
                    </button>
                  </div>
                </div>

                <div className="settings-access-card">
                  <div className="settings-access-card-main">
                    <h3 className="settings-heading">System Audio</h3>
                    <p className="settings-copy">
                      Loopback capture for Chrome / meeting audio (TCC <code>AudioCapture</code>).
                      macOS does not expose a reliable grant check — if capture is silent, enable Amie
                      under System Audio Recording, then quit and reopen.
                    </p>
                    <div className="settings-row">
                      <span className="settings-label">Status</span>
                      <span className="settings-value">Review in System Settings</span>
                    </div>
                  </div>
                  <div className="settings-actions">
                    <button
                      className="btn btn-start"
                      disabled={openingPane !== null}
                      onClick={() => void openAccessPane("systemAudio")}
                    >
                      {openingPane === "systemAudio" ? "Opening…" : "Open System Audio settings"}
                    </button>
                  </div>
                </div>

                <div className="settings-access-card">
                  <div className="settings-access-card-main">
                    <h3 className="settings-heading">Accessibility</h3>
                    <p className="settings-copy">
                      Reads who Zoom or Teams shows as speaking. Does not record the screen.
                    </p>
                    <div className="settings-row">
                      <span className="settings-label">Status</span>
                      <span className="settings-value">
                        {axTrusted == null ? "Loading…" : axTrusted ? "On" : "Off"}
                      </span>
                    </div>
                    <div className="settings-row">
                      <span className="settings-label">This build</span>
                      <span className="settings-value">{axLabel ?? "Loading…"}</span>
                    </div>
                    <div className="settings-row">
                      <span className="settings-label">Signature</span>
                      <span className="settings-value">
                        {speakerStatus
                          ? signatureLabel(speakerStatus)
                          : systemAccess
                            ? "—"
                            : "Loading…"}
                      </span>
                    </div>
                    {(systemAccess?.accessibility.bundleId || speakerStatus?.bundleId) && (
                      <p className="settings-copy">
                        {systemAccess?.accessibility.bundleId ?? speakerStatus?.bundleId}
                      </p>
                    )}
                    {(speakerStatus?.meetingApp === "zoom" ||
                      systemAccess?.accessibility.meetingApp === "zoom") && (
                      <p className="settings-copy">Zoom is open.</p>
                    )}
                    {(speakerStatus?.meetingApp === "teams" ||
                      systemAccess?.accessibility.meetingApp === "teams") && (
                      <p className="settings-copy">Microsoft Teams is open.</p>
                    )}
                  </div>
                  <div className="settings-actions">
                    <button
                      className="btn btn-start"
                      onClick={() => void openAccessPane("accessibility")}
                      disabled={openingPane !== null || axTrusted === true}
                    >
                      {openingPane === "accessibility"
                        ? "Opening…"
                        : axTrusted
                          ? "Allowed"
                          : "Allow Accessibility"}
                    </button>
                  </div>
                </div>
              </section>
            )}

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
        </div>
      </div>
    </main>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10.5 3.5 6 8l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function microphoneLabel(state: MicrophoneAuthorization): string {
  switch (state) {
    case "authorized":
      return "On";
    case "denied":
      return "Off (denied)";
    case "restricted":
      return "Restricted";
    case "notDetermined":
      return "Not asked yet";
    default:
      return "Unknown";
  }
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
