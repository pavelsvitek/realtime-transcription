import { queryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { MeetingDetail, MeetingListItem, MeetingRecord } from "../../lib/meetings";

export const meetingKeys = {
  all: ["meetings"] as const,
  list: () => [...meetingKeys.all, "list"] as const,
  detail: (id: string) => [...meetingKeys.all, "detail", id] as const,
  live: () => [...meetingKeys.all, "live"] as const,
};

export async function getAllMeetings(): Promise<MeetingListItem[]> {
  return invoke<MeetingListItem[]>("get_all_meetings");
}

export async function getMeeting(id: string): Promise<MeetingRecord | null> {
  return invoke<MeetingRecord | null>("get_meeting", { id });
}

export async function getLiveMeeting(): Promise<MeetingDetail | null> {
  return invoke<MeetingDetail | null>("get_live_meeting");
}

export function getAllMeetingsQueryOptions() {
  return queryOptions({
    queryKey: meetingKeys.list(),
    queryFn: getAllMeetings,
  });
}

export function getMeetingQueryOptions(id: string) {
  return queryOptions({
    queryKey: meetingKeys.detail(id),
    queryFn: () => getMeeting(id),
    enabled: Boolean(id),
  });
}

export function getLiveMeetingQueryOptions(enabled = true) {
  return queryOptions({
    queryKey: meetingKeys.live(),
    queryFn: getLiveMeeting,
    enabled,
  });
}

export function useGetLiveMeetingQuery(enabled = true) {
  return useQuery(getLiveMeetingQueryOptions(enabled));
}

export function useGetAllMeetingsQuery() {
  return useQuery(getAllMeetingsQueryOptions());
}

export function useGetMeetingQuery(id: string | undefined) {
  return useQuery(getMeetingQueryOptions(id ?? ""));
}
