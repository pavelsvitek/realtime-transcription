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
};

export function MeetingTabs({
  tab,
  onChange,
  prefix = "meeting",
  transcriptLabel = "Transcript",
}: MeetingTabsProps) {
  return (
    <div className="meeting-tabs" role="tablist">
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
            className={tab === id ? "meeting-tab active" : "meeting-tab"}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
