"use client";

import type { McpPhase } from "@/hooks/use-mcp-story";
import {
  DECISIONS,
  MCP_QUERIES,
  MEETING,
  ROADMAP_MEETINGS,
  SPEAKERS,
} from "@/data/roadmap-cut";

function ClaudeStar({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      aria-hidden
    >
      <path
        d="M12 2C12.4 5.2 13.4 7.2 15.5 9.3C17.6 11.4 19.6 12.4 22.8 12.8C19.6 13.2 17.6 14.2 15.5 16.3C13.4 18.4 12.4 20.4 12 23.6C11.6 20.4 10.6 18.4 8.5 16.3C6.4 14.2 4.4 13.2 1.2 12.8C4.4 12.4 6.4 11.4 8.5 9.3C10.6 7.2 11.6 5.2 12 2Z"
        fill="#D97757"
      />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="flex items-start gap-2.5 self-start">
      <ClaudeStar size={20} />
      <div className="flex h-9 items-center gap-1.5 rounded-2xl bg-[#2E2D2A] px-3.5">
        <span
          className="typing-dot size-1.5 rounded-full bg-[#C4C0B6]"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="typing-dot size-1.5 rounded-full bg-[#8A867C]"
          style={{ animationDelay: "160ms" }}
        />
        <span
          className="typing-dot size-1.5 rounded-full bg-[#5C5A54]"
          style={{ animationDelay: "320ms" }}
        />
      </div>
    </div>
  );
}

function UserBubble({
  text,
  opacity,
}: {
  text: string;
  opacity: number;
}) {
  return (
    <div className="flex w-full justify-end" style={{ opacity }}>
      <div className="flex max-w-[300px] rounded-2xl bg-[#2E2D2A] px-3.5 py-2.5">
        <p className="text-base leading-5 text-[#F4F3EE]">{text}</p>
      </div>
    </div>
  );
}

function SourceChip({
  label,
  folder,
  opacity = 1,
}: {
  label: string;
  folder?: boolean;
  opacity?: number;
}) {
  return (
    <span
      className="flex h-[22px] shrink-0 items-center gap-1.5 self-start rounded-sm bg-[#3A2A22] px-2"
      style={{ opacity }}
    >
      {folder ? (
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
          <rect
            x="2"
            y="3"
            width="12"
            height="10"
            rx="2"
            fill="none"
            stroke="#D97757"
            strokeWidth="1.4"
          />
          <path
            d="M5 3V2.5A1.5 1.5 0 0 1 6.5 1h3A1.5 1.5 0 0 1 11 2.5V3"
            fill="none"
            stroke="#D97757"
            strokeWidth="1.4"
          />
        </svg>
      ) : null}
      <span className="text-xs leading-[14px] font-medium text-[#E8A07A]">
        {label}
      </span>
    </span>
  );
}

export function ChatPopup({
  phase,
  progress,
}: {
  phase: McpPhase;
  progress: number;
}) {
  const query1Opacity = phase === "query1" ? 0.55 + progress * 0.45 : 1;
  const typing1 = phase === "reply1";
  const showResponse1 =
    phase === "response1" ||
    phase === "query2" ||
    phase === "request2" ||
    phase === "lookup2" ||
    phase === "reply2" ||
    phase === "response2";
  const response1Opacity = phase === "response1" ? 0.25 + progress * 0.75 : 1;
  const highlightSecond =
    phase === "query2" ||
    phase === "request2" ||
    phase === "lookup2" ||
    phase === "reply2" ||
    phase === "response2";

  const showQuery2 =
    phase === "query2" ||
    phase === "request2" ||
    phase === "lookup2" ||
    phase === "reply2" ||
    phase === "response2";
  const query2Opacity = phase === "query2" ? 0.55 + progress * 0.45 : 1;
  const typing2 = phase === "reply2";
  const showResponse2 = phase === "response2";
  const response2Opacity = 0.25 + progress * 0.75;

  return (
    <div className="flex h-[720px] w-[400px] flex-col overflow-hidden rounded-2xl bg-[#1C1B19] shadow-[0_0_0_1px_#FFFFFF14,0_24px_80px_#00000099]">
      <div className="flex h-11 w-full shrink-0 items-center justify-between px-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="size-3 shrink-0 rounded-full bg-[#FF5F57]" />
          <span className="size-3 shrink-0 rounded-full bg-[#FEBC2E]" />
          <span className="size-3 shrink-0 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex items-center gap-2">
          <ClaudeStar />
          <span className="text-base leading-[18px] font-semibold tracking-tight text-[#F4F3EE]">
            Cowork
          </span>
        </div>
        <div className="w-12 shrink-0" />
      </div>

      <div className="flex shrink-0 items-center gap-1 px-3 pb-2.5">
        <span className="flex h-7 items-center rounded-md px-2.5 text-sm leading-4 font-medium text-[#A8A59C]">
          Chat
        </span>
        <span className="flex h-7 items-center rounded-md bg-[#F4F3EE] px-2.5 text-sm leading-4 font-semibold text-[#1C1B19]">
          Cowork
        </span>
        <span className="flex h-7 items-center rounded-md px-2.5 text-sm leading-4 font-medium text-[#A8A59C]">
          Code
        </span>
      </div>

      <div className="flex min-h-0 w-full grow flex-col gap-4 overflow-hidden px-4 pt-2 pb-3">
        <UserBubble text={MCP_QUERIES.findMeetings} opacity={query1Opacity} />

        {typing1 ? <TypingDots /> : null}

        {showResponse1 ? (
          <div
            className="flex w-full items-start gap-2.5"
            style={{ opacity: response1Opacity }}
          >
            <ClaudeStar size={20} />
            <div className="flex min-w-0 grow flex-col gap-2.5">
              <p className="text-base leading-5 text-[#F4F3EE]">
                Last 2 roadmap meetings on this Mac:
              </p>
              <div className="flex w-full flex-col gap-1.5">
                {ROADMAP_MEETINGS.map((meeting) => {
                  const selected = highlightSecond && meeting.n === 2;
                  return (
                    <div
                      key={meeting.n}
                      className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 ${
                        selected
                          ? "bg-[#3A2A22] shadow-[inset_0_0_0_1px_#D97757]"
                          : "bg-[#262522]"
                      }`}
                    >
                      <p className="text-sm leading-[18px] font-medium text-[#F4F3EE]">
                        {meeting.n}. {meeting.title}
                      </p>
                      <p className="text-xs leading-4 text-[#A8A59C]">
                        {meeting.when}
                      </p>
                    </div>
                  );
                })}
              </div>
              <SourceChip
                folder
                label="Amie · this Mac"
                opacity={
                  phase === "response1"
                    ? Math.max(0, (progress - 0.35) / 0.65)
                    : 1
                }
              />
            </div>
          </div>
        ) : null}

        {showQuery2 ? (
          <UserBubble
            text={MCP_QUERIES.showDecisions}
            opacity={query2Opacity}
          />
        ) : null}

        {typing2 ? <TypingDots /> : null}

        {showResponse2 ? (
          <div
            className="flex w-full items-start gap-2.5"
            style={{ opacity: response2Opacity }}
          >
            <ClaudeStar size={20} />
            <div className="flex min-w-0 grow flex-col gap-2.5">
              <p className="text-base leading-5 text-[#F4F3EE]">
                Decisions from {MEETING.title} · {MEETING.when}
              </p>
              <div className="flex w-full flex-col gap-2">
                {DECISIONS.map((decision) => (
                  <div key={decision.time} className="flex flex-col gap-0.5">
                    <p className="text-sm leading-[18px] text-[#F4F3EE]">
                      {decision.text}
                    </p>
                    <div className="flex gap-1">
                      <span
                        className={`text-xs leading-4 font-semibold ${SPEAKERS[decision.speaker].className}`}
                      >
                        {SPEAKERS[decision.speaker].name}
                      </span>
                      <span className="text-xs leading-4 text-[#A8A59C]">
                        · {decision.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <SourceChip
                label="0:15–0:31 · this Mac"
                opacity={Math.max(0, (progress - 0.35) / 0.65)}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex w-full shrink-0 flex-col gap-2 px-3 pb-3">
        <div className="flex h-[26px] shrink-0 items-center gap-1.5 self-start rounded-md bg-[#262522] pr-2.5 pl-2">
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3L8 4.5h4.5A1.5 1.5 0 0 1 14 6v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4.5Z"
              fill="none"
              stroke="#A8A59C"
              strokeWidth="1.3"
            />
          </svg>
          <span className="text-xs leading-[14px] font-medium text-[#A8A59C]">
            Work in a folder
          </span>
        </div>
        <div className="flex h-12 w-full shrink-0 items-center gap-2 rounded-2xl bg-[#262522] pr-1.5 pl-3.5 shadow-[inset_0_0_0_1px_#3A3935]">
          <span className="grow text-base leading-[18px] text-[#6F6D66]">
            Give Claude a task
          </span>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F4F3EE]">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M7 11.5V2.5M7 2.5L3.5 6M7 2.5L10.5 6"
                fill="none"
                stroke="#1C1B19"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
