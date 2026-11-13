import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "../../lib/cn";
import {
  SUMMARY_PROVIDERS,
  summaryProviderLabel,
  type ProviderKeys,
  type SummaryProviderId,
} from "../../lib/setup-wizard";
import type { AsrSettings, SummarySettings } from "../../lib/transcript-types";
import { ArrowRight, ErrorText, Icon, PrimaryButton, StepLayout, TextLink } from "./ui";

const KEY_COMMANDS: Record<SummaryProviderId, string> = {
  xai: "set_xai_api_key",
  openai: "set_openai_api_key",
  gemini: "set_gemini_api_key",
};

/** Which providers already have a key, from the two settings commands. */
export async function loadSummarySetup(): Promise<{
  provider: SummaryProviderId;
  providerFromEnv: boolean;
  keys: ProviderKeys;
}> {
  const [asr, summary] = await Promise.all([
    invoke<AsrSettings>("get_asr_settings"),
    invoke<SummarySettings>("get_summary_settings"),
  ]);
  return {
    provider: summary.provider,
    providerFromEnv: summary.providerFromEnv,
    keys: {
      xai: asr.xaiApiKeySet,
      openai: summary.openaiApiKeySet,
      gemini: summary.geminiApiKeySet,
    },
  };
}

export function SummariesStep({ onNext }: { onNext: () => void }) {
  const [provider, setProvider] = useState<SummaryProviderId>("xai");
  const [providerFromEnv, setProviderFromEnv] = useState(false);
  const [keys, setKeys] = useState<ProviderKeys | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSummarySetup()
      .then((setup) => {
        setProvider(setup.provider);
        setProviderFromEnv(setup.providerFromEnv);
        setKeys(setup.keys);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const label = summaryProviderLabel(provider);
  const meta = SUMMARY_PROVIDERS.find((p) => p.id === provider);
  const hasSavedKey = keys?.[provider] ?? false;
  const canSave = key.trim().length > 0 || hasSavedKey;

  const choose = (next: SummaryProviderId) => {
    if (providerFromEnv) return;
    setProvider(next);
    setKey("");
    setError(null);
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setKey(text.trim());
    } catch {
      // Clipboard reads can be refused; the field still takes ⌘V.
    }
    inputRef.current?.focus();
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (key.trim()) await invoke(KEY_COMMANDS[provider], { key: key.trim() });
      if (!providerFromEnv) await invoke("set_summary_provider", { provider });
      setKey("");
      onNext();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepLayout
      step="summaries"
      title="Get a summary after every meeting."
      copy="Pick who writes your notes. Transcripts work without it, summaries need a key from one provider."
    >
      <div className="mt-6 flex w-full items-stretch gap-2.5" role="radiogroup" aria-label="Summary provider">
        {SUMMARY_PROVIDERS.map((p) => {
          const selected = p.id === provider;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={providerFromEnv && !selected}
              onClick={() => choose(p.id)}
              className={cn(
                "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl px-4 py-3.5 text-left disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-[1.5px] border-brand-primary bg-brand-accent-soft"
                  : "border border-border-input bg-surface-content hover:bg-surface-hover",
              )}
            >
              <span
                className={cn(
                  "size-4 shrink-0 rounded-full bg-surface-content",
                  selected ? "border-[5px] border-brand-primary" : "border-[1.5px] border-border-input",
                )}
                aria-hidden="true"
              />
              <span className="flex flex-col">
                <span className="text-[14px] leading-5 font-[650] text-text-primary">{p.label}</span>
                {p.recommended ? (
                  <span className="text-[12px] leading-[17px] font-medium text-text-brand">
                    Recommended
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-[22px] flex w-full flex-col gap-2">
        <label htmlFor="wizard-api-key" className="text-[13px] leading-[19px] font-semibold text-text-primary">
          {label} API key
        </label>
        <div className="flex h-[42px] w-full shrink-0 items-center gap-2 rounded-md border-[1.5px] border-border-input bg-surface-content px-3.5 focus-within:border-brand-speaker-user focus-within:shadow-[0_0_0_3px_var(--brand-primary-ring)]">
          <input
            ref={inputRef}
            id="wizard-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={hasSavedKey ? "Saved on this Mac. Paste a new key to replace it." : "Paste your key"}
            className="min-w-0 flex-1 bg-transparent text-[15px] leading-[22px] tracking-[0.1em] text-text-primary outline-none placeholder:tracking-normal placeholder:text-text-muted"
          />
          <button
            type="button"
            className="cursor-pointer text-[12.5px] leading-[18px] font-semibold text-text-brand hover:underline"
            onClick={() => void paste()}
          >
            Paste
          </button>
        </div>
        <div className="flex w-full items-center gap-1.5">
          <span className="text-text-muted">
            <Icon size={13}>
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </Icon>
          </span>
          <span className="flex-1 text-[12.5px] leading-[18px] text-text-muted">
            Stays on this Mac, never sent anywhere but {label}.
          </span>
          {meta ? (
            <button
              type="button"
              className="cursor-pointer text-[12.5px] leading-5 font-[550] text-text-brand underline decoration-1"
              onClick={() => void openUrl(meta.keyUrl)}
            >
              Where do I get a key?
            </button>
          ) : null}
        </div>
      </div>

      {providerFromEnv ? (
        <p className="mt-3 text-[12.5px] leading-[18px] text-text-muted">
          The provider is set by <code>SUMMARY_LLM_PROVIDER</code>.
        </p>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <div className="mt-6 flex items-center gap-4">
        <PrimaryButton className="px-6" onClick={() => void save()} disabled={!canSave || saving}>
          {saving ? "Saving…" : "Save and continue"}
          <ArrowRight />
        </PrimaryButton>
        <TextLink onClick={onNext} disabled={saving}>
          Skip for now
        </TextLink>
        <span className="text-[12.5px] leading-[18px] text-text-muted">
          Transcripts still work without a key.
        </span>
      </div>
    </StepLayout>
  );
}
