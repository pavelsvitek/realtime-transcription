import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  MeetingDetail,
  MeetingListItem,
  MeetingPatch,
  MeetingRecord,
} from "../../lib/meetings";
import { meetingKeys } from "./queries";

export async function patchMeeting(
  id: string,
  payload: MeetingPatch,
): Promise<MeetingRecord> {
  const body: MeetingPatch = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.context !== undefined) body.context = payload.context ?? "";
  if (payload.summary !== undefined) body.summary = payload.summary ?? "";
  if (payload.archivedAt !== undefined) body.archivedAt = payload.archivedAt;
  return invoke<MeetingRecord>("patch_meeting", { id, payload: body });
}

export async function deleteMeeting(id: string): Promise<void> {
  await invoke("delete_meeting", { id });
}

export async function generateMeetingSummary(id: string): Promise<void> {
  await invoke("generate_meeting_summary", { id });
}

export function usePatchMeetingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: MeetingPatch }) =>
      patchMeeting(id, payload),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: meetingKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: meetingKeys.list() });
      const previousDetail = queryClient.getQueryData<MeetingRecord | null>(
        meetingKeys.detail(id),
      );
      const previousList = queryClient.getQueryData<MeetingListItem[]>(
        meetingKeys.list(),
      );
      const previousLive = queryClient.getQueryData<MeetingDetail | null>(
        meetingKeys.live(),
      );

      if (
        previousDetail &&
        (payload.title !== undefined ||
          payload.context !== undefined ||
          payload.summary !== undefined)
      ) {
        const nextContext =
          payload.context === undefined
            ? previousDetail.meeting.context
            : payload.context && payload.context.trim().length > 0
              ? payload.context.trim()
              : null;
        const nextSummary =
          payload.summary === undefined
            ? previousDetail.meeting.summary
            : payload.summary && payload.summary.trim().length > 0
              ? payload.summary.trim()
              : null;
        queryClient.setQueryData(meetingKeys.detail(id), {
          ...previousDetail,
          meeting: {
            ...previousDetail.meeting,
            ...(payload.title !== undefined ? { title: payload.title } : {}),
            ...(payload.context !== undefined ? { context: nextContext } : {}),
            ...(payload.summary !== undefined ? { summary: nextSummary } : {}),
          },
        });
      }

      if (previousList) {
        if (payload.archivedAt !== undefined) {
          queryClient.setQueryData(
            meetingKeys.list(),
            previousList.filter((meeting) => meeting.id !== id),
          );
        } else if (payload.title !== undefined) {
          queryClient.setQueryData(
            meetingKeys.list(),
            previousList.map((meeting) =>
              meeting.id === id ? { ...meeting, title: payload.title! } : meeting,
            ),
          );
        }
      }

      if (
        previousLive?.id === id &&
        (payload.context !== undefined || payload.summary !== undefined)
      ) {
        queryClient.setQueryData(meetingKeys.live(), {
          ...previousLive,
          ...(payload.context !== undefined
            ? {
                context:
                  payload.context && payload.context.trim().length > 0
                    ? payload.context.trim()
                    : null,
              }
            : {}),
          ...(payload.summary !== undefined
            ? {
                summary:
                  payload.summary && payload.summary.trim().length > 0
                    ? payload.summary.trim()
                    : null,
              }
            : {}),
        });
      }

      return { previousDetail, previousList, previousLive };
    },
    onError: (_err, { id }, ctx) => {
      if (!ctx) return;
      if (ctx.previousDetail !== undefined) {
        queryClient.setQueryData(meetingKeys.detail(id), ctx.previousDetail);
      }
      if (ctx.previousList !== undefined) {
        queryClient.setQueryData(meetingKeys.list(), ctx.previousList);
      }
      if (ctx.previousLive !== undefined) {
        queryClient.setQueryData(meetingKeys.live(), ctx.previousLive);
      }
    },
    onSuccess: (record, { id, payload }) => {
      queryClient.setQueryData(meetingKeys.detail(id), record);
      queryClient.setQueryData(
        meetingKeys.list(),
        (prev: MeetingListItem[] | undefined) => {
          if (!prev) return prev;
          if (payload.archivedAt !== undefined) {
            return prev.filter((meeting) => meeting.id !== id);
          }
          return prev.map((meeting) =>
            meeting.id === id
              ? {
                  ...meeting,
                  title: record.meeting.title,
                  teaser: record.meeting.teaser,
                }
              : meeting,
          );
        },
      );
      if (
        payload.context !== undefined ||
        payload.summary !== undefined ||
        payload.archivedAt !== undefined
      ) {
        void queryClient.invalidateQueries({ queryKey: meetingKeys.live() });
      }
    },
  });
}

export function useDeleteMeetingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteMeeting(id),
    onSuccess: (_void, { id }) => {
      queryClient.removeQueries({ queryKey: meetingKeys.detail(id) });
      queryClient.setQueryData(
        meetingKeys.list(),
        (prev: MeetingListItem[] | undefined) =>
          prev?.filter((meeting) => meeting.id !== id),
      );
    },
  });
}

export function useGenerateMeetingSummaryMutation() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => generateMeetingSummary(id),
  });
}
