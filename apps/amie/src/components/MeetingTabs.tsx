import { cn } from "../lib/cn";

export type MeetingDetailTab = "summary" | "context" | "transcript";

export const MEETING_TAB_ORDER: MeetingDetailTab[] = [
  "summary",
  "context",
  "transcript",
];

export const LIVE_TRANSCRIPT_TAB_LABEL = "Transcript (live)";

const TAB_LABELS: Record<MeetingDetailTab, string> = {
  summary: "Summary",
  context: "Context",
  transcript: "Transcript",
};

export function meetingTabDomIds(prefix: string, tab: MeetingDetailTab) {
  return {
    tabId: `${prefix}-tab-${tab}`,
    panelId: `${prefix}-panel-${tab}`,
  };
}

type MeetingTabsProps = {
  tab: MeetingDetailTab;
  onChange: (tab: MeetingDetailTab) => void;
  prefix?: string;
  transcriptLabel?: string;
  className?: string;
};

export function MeetingTabs({
  tab,
  onChange,
  prefix = "meeting",
  transcriptLabel = "Transcript",
  className,
}: MeetingTabsProps) {
  return (
    <div
      className={cn("mb-5 flex gap-5 border-b border-border-default", className)}
      role="tablist"
    >
      {MEETING_TAB_ORDER.map((id) => {
        const label = id === "transcript" ? transcriptLabel : TAB_LABELS[id];
        const { tabId, panelId } = meetingTabDomIds(prefix, id);
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={tabId}
            aria-controls={panelId}
            aria-selected={tab === id}
            className={cn(
              "cursor-pointer border-none bg-transparent px-0 pt-2 pb-2.5 font-[family-name:inherit] text-[14px] text-text-muted",
              tab === id &&
                "font-semibold text-text-primary shadow-[inset_0_-2px_0_var(--brand-accent)]",
            )}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
