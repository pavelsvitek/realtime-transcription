"use client";

import type { McpPhase } from "@/hooks/use-mcp-story";

function Spark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <path
        d="M6 1.2L7.1 4.4H10.5L7.75 6.35L8.85 9.6L6 7.7L3.15 9.6L4.25 6.35L1.5 4.4H4.9L6 1.2Z"
        fill="#EDEDED"
      />
    </svg>
  );
}

export function ChatPopup({ phase }: { phase: McpPhase }) {
  const showQuery = true;
  const showTyping = phase === "reply";
  const showResponse = phase === "response";

  return (
    <div className="flex h-[720px] w-[400px] flex-col overflow-hidden rounded-2xl bg-[#212121] shadow-[0_0_0_1px_#FFFFFF14,0_24px_80px_#0000008C]">
      <div className="flex h-[52px] shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-[#3F3F3F]">
            <Spark />
          </span>
          <span className="text-base leading-[14px] font-semibold text-[#EDEDED]">
            Chat
          </span>
        </div>
        <span className="text-sm leading-[13px] text-[#A1A1A1]">New</span>
      </div>

      <div className="flex grow flex-col items-end gap-4 px-4 pt-2 pb-4">
        {showQuery ? (
          <div
            key="query"
            className="msg-in flex max-w-[320px] flex-col items-end rounded-2xl bg-dark-surface-elevated px-3.5 py-2.5"
          >
            <p className="text-md leading-[22px] text-[#ECECEC]">
              Did we commit to local ASR first?
            </p>
          </div>
        ) : null}

        {showTyping ? (
          <div
            key="typing"
            className="msg-in flex h-9 shrink-0 items-center gap-1.5 self-start rounded-2xl bg-dark-surface-elevated px-3.5"
          >
            <span
              className="typing-dot size-1.5 rounded-full bg-[#B4B4B4]"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="typing-dot size-1.5 rounded-full bg-[#8A8A8A]"
              style={{ animationDelay: "160ms" }}
            />
            <span
              className="typing-dot size-1.5 rounded-full bg-[#5E5E5E]"
              style={{ animationDelay: "320ms" }}
            />
          </div>
        ) : null}

        {showResponse ? (
          <div
            key="response"
            className="msg-in flex w-[340px] items-start gap-2.5 self-start"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#3F3F3F]">
              <Spark />
            </span>
            <div className="flex grow flex-col gap-2">
              <p className="text-md leading-[22px] text-[#ECECEC]">
                Yes. You said to prioritize the offline path — local ASR before
                cloud fallback.
              </p>
              <span className="flex h-[22px] shrink-0 items-center self-start rounded-sm bg-raycast-accent-blue-soft px-2">
                <span className="text-xs leading-3 font-medium text-raycast-accent-blue">
                  0:15 · this Mac
                </span>
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex h-[72px] shrink-0 items-center px-3 pb-4">
        <div className="flex h-12 w-[376px] shrink-0 items-center gap-2 rounded-[24px] bg-[#303030] pr-2 pl-4">
          <span className="grow text-base leading-[14px] text-[#8F8F8F]">
            Ask anything
          </span>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#676767]">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M7 11.5V2.5M7 2.5L3.5 6M7 2.5L10.5 6"
                fill="none"
                stroke="#212121"
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
