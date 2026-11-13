import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type WizardSystemAccess = {
  microphone: string;
  accessibility: { trusted: boolean };
  googleMeetExtension: { connected: boolean };
};

/**
 * macOS permissions as the app sees them. Grants happen outside the app
 * (a prompt or System Settings), so it re-checks on focus and, while `poll`
 * is on, every 1.5s.
 */
export function useSystemAccess(poll: boolean) {
  const [status, setStatus] = useState<WizardSystemAccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await invoke<WizardSystemAccess>("get_system_access_status"));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = poll ? window.setInterval(() => void refresh(), 1500) : undefined;
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [refresh, poll]);

  return { status, setStatus, error, refresh };
}
