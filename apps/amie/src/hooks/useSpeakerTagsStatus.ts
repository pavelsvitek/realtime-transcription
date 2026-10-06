import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SpeakerTagsStatus } from "../lib/transcript-types";

const STATUS_KEY = ["speaker-tags-status"] as const;

/** While Accessibility is off, check often enough to notice the toggle. */
const UNTRUSTED_POLL_MS = 2000;

/**
 * Accessibility status shared by every screen that shows it.
 *
 * One cached query, so the banner and Settings never disagree. It polls only
 * while the permission is off, and re-reads whenever the window regains focus:
 * that is when the user comes back from System Settings, or has revoked it.
 */
export function useSpeakerTagsStatus() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => invoke<SpeakerTagsStatus>("get_speaker_tags_status"),
    refetchInterval: (current) => (current.state.data?.trusted ? false : UNTRUSTED_POLL_MS),
  });

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [queryClient]);

  const request = useMutation({
    mutationFn: () => invoke<SpeakerTagsStatus>("request_accessibility_permission"),
    onSuccess: (next) => queryClient.setQueryData(STATUS_KEY, next),
  });

  return {
    status: query.data,
    requestAccess: request.mutate,
    requesting: request.isPending,
    requested: request.isSuccess,
    requestError: request.error ? String(request.error) : null,
  };
}
