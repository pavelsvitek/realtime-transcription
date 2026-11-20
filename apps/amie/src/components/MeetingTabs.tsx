import { cn } from "../lib/cn";

export type MeetingDetailTab = "summary" | "context" | "transcript";

export const MEETING_TAB_ORDER: MeetingDetailTab[] = [
  "transcript",
  "context",
  "summary",
];

const TAB_LABELS: Record<MeetingDetailTab, string> = {
  summary: "Summary",
  context: "Context",
  transcript: "Transcript",
};

/**
 * Step to the next/previous tab, skipping locked ones. Stops at the ends
 * instead of wrapping around.
 */
export function moveMeetingTab(
  current: MeetingDetailTab,
  direction: "left" | "right",
  locked?: Partial<Record<MeetingDetailTab, string>>,
): MeetingDetailTab {
  const step = direction === "right" ? 1 : -1;
  let index = MEETING_TAB_ORDER.indexOf(current) + step;
  while (index >= 0 && index < MEETING_TAB_ORDER.length) {
    const candidate = MEETING_TAB_ORDER[index]!;
    if (!locked?.[candidate]) return candidate;
    index += step;
  }
  return current;
}

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
  className?: string;
  /** Tabs that cannot be opened yet, with the reason shown next to the label. */
  locked?: Partial<Record<MeetingDetailTab, string>>;
};

export function MeetingTabs({
  tab,
  onChange,
  prefix = "meeting",
  className,
  locked,
}: MeetingTabsProps) {
  return (
    <div
      className={cn("mb-5 flex gap-5 border-b border-border-default", className)}
      role="tablist"
    >
      {MEETING_TAB_ORDER.map((id) => {
        const label = TAB_LABELS[id];
        const { tabId, panelId } = meetingTabDomIds(prefix, id);
        const lockedReason = locked?.[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={tabId}
            aria-controls={panelId}
            aria-selected={tab === id}
            disabled={Boolean(lockedReason)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 border-none bg-transparent px-0 pt-2 pb-2.5 font-[family-name:inherit] text-[14px] text-text-muted",
              lockedReason && "cursor-default text-text-muted/60",
              tab === id &&
                "font-semibold text-text-primary shadow-[inset_0_-2px_0_var(--brand-accent)]",
            )}
            onClick={() => onChange(id)}
          >
            {lockedReason && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            )}
            {label}
            {lockedReason && (
              <span className="rounded-full bg-surface-muted px-[7px] py-px text-[10px] font-normal leading-[14px] text-text-muted">
                {lockedReason}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
