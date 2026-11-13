import { useEffect, useState } from "react";
import { useSpeechModelDownload } from "../../hooks/useSpeechModelDownload";
import {
  readyRows,
  type ProviderKeys,
  type ReadyRow,
  type SummaryProviderId,
  type SystemAudioTestResult,
} from "../../lib/setup-wizard";
import { loadSummarySetup } from "./SummariesStep";
import { useSystemAccess } from "./useSystemAccess";

/**
 * The setup recap ("You're all set." and Home's setup note), from the app's
 * live state. Null until permissions and summary settings have loaded.
 */
export function useSetupStatus(systemAudio: SystemAudioTestResult): ReadyRow[] | null {
  const model = useSpeechModelDownload();
  const { status } = useSystemAccess(false);
  const [summary, setSummary] = useState<{
    provider: SummaryProviderId | null;
    keys: ProviderKeys;
  } | null>(null);

  useEffect(() => {
    loadSummarySetup()
      .then((setup) => setSummary({ provider: setup.provider, keys: setup.keys }))
      .catch(() =>
        setSummary({ provider: null, keys: { xai: false, openai: false, gemini: false } }),
      );
  }, []);

  if (!status || !summary) return null;
  return readyRows({
    modelReady: model.ready,
    modelDownloading: model.downloading,
    microphoneAllowed: status.microphone === "authorized",
    systemAudio,
    summaryProvider: summary.provider,
    providerKeys: summary.keys,
    accessibilityAllowed: status.accessibility.trusted === true,
    meetConnected: status.googleMeetExtension.connected === true,
  });
}
