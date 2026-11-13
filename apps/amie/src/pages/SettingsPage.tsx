import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { invoke } from "@tauri-apps/api/core";
import type { AsrSettings, SummaryProvider, SummarySettings } from "../lib/transcript-types";
import { summaryProviderHasKey } from "../lib/summary-providers";
import { useSpeakerTagsStatus } from "../hooks/useSpeakerTagsStatus";
import { codeRequirementLabel, signatureLabel } from "../lib/speaker-tags";
import { moveSettingsSection } from "../lib/nav-hotkeys";
import { Button } from "../components/ui/Button";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { cn } from "../lib/cn";

/** Settings styles, one per former settings-* class. */
const S = {
  section:
    "flex max-w-[640px] flex-col gap-3.5 px-6 pt-2 pb-7",
  paneTitle:
    "m-0 text-[20px] font-[650] tracking-[-0.02em] text-text-primary",
  heading:
    "m-0 text-[16px] font-semibold",
  copy:
    "m-0 text-[13px] leading-[1.45] text-text-secondary [&_code]:font-mono [&_code]:text-[12px] [&_code]:break-all",
  code:
    "m-0 overflow-x-auto rounded-lg border border-border-default bg-surface-muted px-3.5 py-3 font-mono text-[12px] leading-[1.45] break-all whitespace-pre-wrap text-text-primary",
  accessCard:
    "flex flex-col gap-3 border-t border-border-default py-3.5 first-of-type:border-t-0 first-of-type:pt-0",
  accessCardMain:
    "flex flex-col gap-2.5",
  row:
    "flex flex-col gap-1.5",
  label:
    "text-[12px] text-text-secondary",
  value:
    "text-[13px] text-text-primary",
  input:
    "rounded-md border border-border-input bg-surface-input px-2.5 py-2 font-[family-name:inherit] text-[13px] text-text-primary",
  actions:
    "flex flex-wrap items-center gap-2",
  status:
    "text-[13px] text-text-secondary",
  navItem:
    "w-full cursor-pointer rounded-md border-none bg-transparent px-2.5 py-2 text-left font-[family-name:inherit] text-[13px] leading-[1.5] text-text-secondary hover:bg-surface-hover hover:text-text-primary",
};

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

type GoogleMeetExtensionStatus = {
  connected: boolean;
  browsers: string[];
  inCallTabs: number;
  extensionVersion: string | null;
  health: string;
  remoteSpeaking: string[];
  selfSpeaking: string[];
  selfMuted: boolean;
};

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
    codeRequirement?: string | null;
  };
  googleMeetExtension: GoogleMeetExtensionStatus;
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
    const timer = window.setInterval(() => void refreshSystemAccess(), 2000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
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
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 items-stretch overflow-hidden">
        <nav
          className="flex w-[220px] shrink-0 flex-col overflow-y-auto border-r border-border-default bg-surface-chrome px-3 pb-6"
          aria-label="Settings sections"
        >
          <div
            className="-mx-3 h-[var(--window-chrome-top)] shrink-0"
            data-tauri-drag-region
            aria-hidden="true"
          />
          <div className="shrink-0 pt-1 pb-3">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-2.5 py-2 text-left font-[family-name:inherit] text-[13px] leading-[1.5] font-[650] tracking-[-0.02em] text-text-primary transition-[background-color,color] duration-150 ease-[ease] hover:bg-surface-hover"
              onClick={onBack}
              aria-label="Back"
            >
              <BackIcon />
              <span>Settings</span>
            </button>
          </div>
          <ul className="flex min-h-0 flex-1 list-none flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    S.navItem,
                    section === item.id && "bg-surface-hover font-semibold text-text-primary",
                  )}
                  aria-current={section === item.id ? "page" : undefined}
                  onClick={() => selectSection(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-content">
          <div className="min-h-0 flex-1 overflow-y-auto pt-[calc(var(--window-chrome-top)+8px)]">
            {section === "meeting-summary" && (
              <>
                <section className={S.section}>
                  <h2 className={S.paneTitle}>Meeting summary</h2>
                  <p className={S.copy}>
                    Choose which model writes the meeting title and summary. xAI stays the default.
                    <code>SUMMARY_LLM_PROVIDER</code> overrides this choice.
                  </p>
                  <label className={S.row}>
                    <span className={S.label}>Provider</span>
                    <select
                      className={S.input}
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
                    <p className={S.copy}>
                      Provider is set by <code>SUMMARY_LLM_PROVIDER</code> and cannot be edited here.
                    </p>
                  )}
                </section>

                <section className={S.section}>
                  <h2 className={S.heading}>xAI Transcribe 2.0</h2>
                  <p className={S.copy}>
                    Used when ASR is set to <strong>xAI Transcribe 2.0</strong> on the New chat page.
                    Live sessions pin <code>grok-voice-transcribe-2.0</code>. The key is stored under
                    Application Support (or taken from <code>XAI_API_KEY</code>). Meeting summaries use
                    this same key when the summary provider is xAI.
                  </p>

                  <div className={S.row}>
                    <span className={S.label}>Status</span>
                    <span className={S.value}>{keyState}</span>
                  </div>

                  <label className={S.row}>
                    <span className={S.label}>API key</span>
                    <input
                      type="password"
                      className={S.input}
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

                  <div className={S.actions}>
                    <Button
                      onClick={() => void saveKey()}
                      disabled={saving || fieldLocked || apiKey.trim().length === 0}
                    >
                      {saving ? "Saving…" : "Save key"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void clearKey()}
                      disabled={saving || !settings?.xaiApiKeySaved}
                    >
                      Clear saved key
                    </Button>
                  </div>

                  {fieldLocked && settings?.xaiApiKeySaved && (
                    <p className={S.copy}>
                      Clear the saved key to enter a new one. The real key is never shown.
                    </p>
                  )}
                  {fieldLocked && settings?.xaiApiKeyFromEnv && !settings.xaiApiKeySaved && (
                    <p className={S.copy}>
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
              <section className={S.section}>
                <h2 className={S.paneTitle}>MCP</h2>
                <p className={S.copy}>
                  Connect Claude, Cursor, or Codex so they can use your Amie meetings on this Mac.
                  Open Amie at least once before connecting.
                </p>

                <div className={S.row}>
                  <span className={S.label}>Status</span>
                  <span className={S.value}>
                    {mcp
                      ? mcp.binaryFound
                        ? "Ready"
                        : "Amie MCP isn’t available in this build yet"
                      : "Loading…"}
                  </span>
                </div>

                <h3 className={S.heading}>Claude</h3>
                <p className={S.copy}>Run in Terminal, then restart Claude Code:</p>
                <pre className={S.code}>{mcp?.claudeCommand ?? "Loading…"}</pre>

                <h3 className={S.heading}>Cursor</h3>
                <p className={S.copy}>
                  Add this to <code>~/.cursor/mcp.json</code>, then reload MCP servers:
                </p>
                <pre className={S.code}>{mcp?.cursorConfig ?? "Loading…"}</pre>

                <h3 className={S.heading}>Codex</h3>
                <p className={S.copy}>
                  Add this to <code>~/.codex/config.toml</code>, then restart Codex:
                </p>
                <pre className={S.code}>{mcp?.codexConfig ?? "Loading…"}</pre>
              </section>
            )}

            {section === "system-access" && (
              <section className={S.section}>
                <h2 className={S.paneTitle}>System access</h2>
                <p className={S.copy}>
                  Amie needs these macOS permissions for live capture and speaker names. Each build
                  (Amie vs Amie Dev) has its own row in System Settings.
                </p>

                <div className={S.accessCard}>
                  <div className={S.accessCardMain}>
                    <h3 className={S.heading}>Microphone</h3>
                    <p className={S.copy}>Used when the input source includes the mic.</p>
                    <div className={S.row}>
                      <span className={S.label}>Status</span>
                      <span className={S.value}>
                        {systemAccess
                          ? microphoneLabel(systemAccess.microphone)
                          : "Loading…"}
                      </span>
                    </div>
                  </div>
                  <div className={S.actions}>
                    <Button
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
                    </Button>
                  </div>
                </div>

                <div className={S.accessCard}>
                  <div className={S.accessCardMain}>
                    <h3 className={S.heading}>System Audio</h3>
                    <p className={S.copy}>
                      Loopback capture for Chrome / meeting audio (TCC <code>AudioCapture</code>).
                      macOS does not expose a reliable grant check — if capture is silent, enable Amie
                      under System Audio Recording, then quit and reopen.
                    </p>
                    <div className={S.row}>
                      <span className={S.label}>Status</span>
                      <span className={S.value}>Review in System Settings</span>
                    </div>
                  </div>
                  <div className={S.actions}>
                    <Button
                      disabled={openingPane !== null}
                      onClick={() => void openAccessPane("systemAudio")}
                    >
                      {openingPane === "systemAudio" ? "Opening…" : "Open System Audio settings"}
                    </Button>
                  </div>
                </div>

                <div className={S.accessCard}>
                  <div className={S.accessCardMain}>
                    <h3 className={S.heading}>Accessibility</h3>
                    <p className={S.copy}>
                      Reads who Zoom or Teams shows as speaking. Does not record the screen.
                    </p>
                    <div className={S.row}>
                      <span className={S.label}>Status</span>
                      <span className={S.value}>
                        {axTrusted == null ? "Loading…" : axTrusted ? "On" : "Off"}
                      </span>
                    </div>
                    <div className={S.row}>
                      <span className={S.label}>This build</span>
                      <span className={S.value}>{axLabel ?? "Loading…"}</span>
                    </div>
                    <div className={S.row}>
                      <span className={S.label}>Signature</span>
                      <span className={S.value}>
                        {speakerStatus
                          ? signatureLabel(speakerStatus)
                          : systemAccess
                            ? "—"
                            : "Loading…"}
                      </span>
                    </div>
                    {speakerStatus && codeRequirementLabel(speakerStatus) && (
                      <div className={S.row}>
                        <span className={S.label}>Code identity</span>
                        <span className={S.value}>
                          {codeRequirementLabel(speakerStatus)}
                        </span>
                      </div>
                    )}
                    {(systemAccess?.accessibility.bundlePath ||
                      speakerStatus?.bundlePath) && (
                      <p className={S.copy}>
                        {systemAccess?.accessibility.bundlePath ?? speakerStatus?.bundlePath}
                      </p>
                    )}
                    {(systemAccess?.accessibility.bundleId || speakerStatus?.bundleId) && (
                      <p className={S.copy}>
                        {systemAccess?.accessibility.bundleId ?? speakerStatus?.bundleId}
                      </p>
                    )}
                    {(speakerStatus?.meetingApp === "zoom" ||
                      systemAccess?.accessibility.meetingApp === "zoom") && (
                      <p className={S.copy}>Zoom is open.</p>
                    )}
                    {(speakerStatus?.meetingApp === "teams" ||
                      systemAccess?.accessibility.meetingApp === "teams") && (
                      <p className={S.copy}>Microsoft Teams is open.</p>
                    )}
                  </div>
                  <div className={S.actions}>
                    <Button
                      onClick={() => void openAccessPane("accessibility")}
                      disabled={openingPane !== null || axTrusted === true}
                    >
                      {openingPane === "accessibility"
                        ? "Opening…"
                        : axTrusted
                          ? "Allowed"
                          : "Allow Accessibility"}
                    </Button>
                  </div>
                </div>

                <div className={S.accessCard}>
                  <div className={S.accessCardMain}>
                    <h3 className={S.heading}>Google Meet extension</h3>
                    <p className={S.copy}>
                      Names remote speakers in Google Meet from the Amie for Google Meet extension.
                      Zoom and Teams still use Accessibility.
                    </p>
                    <div className={S.row}>
                      <span className={S.label}>Status</span>
                      <span className={S.value}>
                        {meetExtensionLabel(systemAccess?.googleMeetExtension)}
                      </span>
                    </div>
                    {systemAccess?.googleMeetExtension.connected && (
                      <p className={S.copy}>
                        {systemAccess.googleMeetExtension.inCallTabs} Meet{" "}
                        {systemAccess.googleMeetExtension.inCallTabs === 1 ? "tab" : "tabs"} in a call
                        {systemAccess.googleMeetExtension.extensionVersion
                          ? ` · extension ${systemAccess.googleMeetExtension.extensionVersion}`
                          : ""}
                        .
                      </p>
                    )}
                    {systemAccess?.googleMeetExtension.connected && (
                      <div className={S.row}>
                        <span className={S.label}>Speaking</span>
                        <span className={S.value}>
                          {meetSpeakingLabel(systemAccess.googleMeetExtension)}
                        </span>
                      </div>
                    )}
                    {systemAccess?.googleMeetExtension.health === "degraded" && (
                      <p className={S.copy}>
                        Google Meet level meters look different than expected, so speaker names may be missing.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {status && (
              <section className={S.section}>
                <div className={S.status}>{status}</div>
              </section>
            )}
            {error && (
              <section className={S.section}>
                <ErrorBanner>{error}</ErrorBanner>
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

function meetExtensionLabel(status: GoogleMeetExtensionStatus | undefined): string {
  if (!status) return "Loading…";
  if (!status.connected) return "Not detected";
  const browsers = status.browsers.map(browserLabel).filter(Boolean);
  return browsers.length > 0 ? `Connected (${browsers.join(", ")})` : "Connected";
}

function meetSpeakingLabel(status: GoogleMeetExtensionStatus): string {
  const remote = status.remoteSpeaking ?? [];
  const self = status.selfSpeaking ?? [];
  const parts: string[] = [];
  if (remote.length) parts.push(remote.join(", "));
  if (self.length) parts.push(`You (${self.join(", ")})`);
  const speaking = parts.length > 0 ? parts.join(" · ") : "Nobody speaking";
  return status.selfMuted ? `${speaking} · Your mic is muted, not recorded` : speaking;
}

function browserLabel(browser: string): string {
  if (browser === "brave") return "Brave";
  if (browser === "chrome") return "Chrome";
  return browser;
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
    <section className={S.section}>
      <h2 className={S.heading}>{title}</h2>
      <p className={S.copy}>{copy}</p>

      <div className={S.row}>
        <span className={S.label}>Status</span>
        <span className={S.value}>{keyStatus(keyFromEnv, keySaved, loaded)}</span>
      </div>

      <label className={S.row}>
        <span className={S.label}>API key</span>
        <input
          type="password"
          className={S.input}
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

      <div className={S.actions}>
        <Button
          onClick={onSave}
          disabled={saving || keyIsSet || value.trim().length === 0}
        >
          {saving ? "Saving…" : "Save key"}
        </Button>
        <Button variant="outline" onClick={onClear} disabled={saving || !keySaved}>
          Clear saved key
        </Button>
      </div>

      {keyIsSet && keySaved && (
        <p className={S.copy}>
          Clear the saved key to enter a new one. The real key is never shown.
        </p>
      )}
      {keyIsSet && keyFromEnv && !keySaved && (
        <p className={S.copy}>
          Key is provided by <code>{envName}</code> and cannot be edited here.
        </p>
      )}
    </section>
  );
}
