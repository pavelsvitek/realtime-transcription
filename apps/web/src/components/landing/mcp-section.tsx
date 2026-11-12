"use client";

import { useRef } from "react";
import { ChatPopup } from "@/components/landing/chat-popup";
import { DataFlow } from "@/components/landing/data-flow";
import { DatabaseIcon } from "@/components/landing/database-icon";
import { GridPattern } from "@/components/landing/grid-background";
import { useMcpStory, type McpFlow } from "@/hooks/use-mcp-story";

function engineGlow(flow: McpFlow, progress: number): string {
  if (flow === "lookup") {
    const a = 0.15 + progress * 0.2;
    return `0 0 0 2px var(--color-raycast-accent-blue), 0 0 48px rgba(111, 176, 222, ${a})`;
  }
  if (flow === "request") {
    const a = progress * 0.22;
    return a > 0.02 ? `0 0 32px rgba(111, 176, 222, ${a})` : "none";
  }
  return "none";
}

export function McpSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { phase, progress, scene, caption, flow } = useMcpStory(trackRef);

  return (
    <section id="local-mcp" className="relative w-full pt-24">
      <div className="relative isolate">
        <div
          aria-hidden
          className="page-zoom pointer-events-none absolute inset-0 -z-10 select-none"
        >
          <GridPattern fade="top" />
        </div>
        <div className="mx-auto w-full max-w-[calc(1440px*var(--page-zoom))]">
          <div className="page-zoom flex w-[560px] flex-col gap-5 px-16 pb-16">
            <div className="flex h-6 shrink-0 items-center self-start rounded bg-raycast-accent-blue-soft px-2.5">
              <span className="text-xs leading-3 font-medium tracking-[0.4px] text-raycast-accent-blue">
                Local MCP
              </span>
            </div>
            <h2 className="flex w-[560px] flex-col">
              <span className="text-4xl font-semibold tracking-[0.2px] text-raycast-ink">
                Ask Amie
              </span>
              <span className="text-4xl font-semibold tracking-[0.2px] text-raycast-mute">
                from anywhere.
              </span>
            </h2>
            <p className="w-[480px] text-lg text-raycast-body">
              Cursor, Claude, or any MCP client. Meetings stay on this Mac — no
              cloud index.
            </p>
          </div>
        </div>
      </div>

      <div ref={trackRef} className="relative h-[800vh]">
        <div className="sticky top-0 isolate flex h-svh flex-col">
          <div
            aria-hidden
            className="page-zoom pointer-events-none absolute inset-0 -z-10 select-none"
          >
            <GridPattern fadeSize={120} />
          </div>
          <div className="shrink-0 border-b border-raycast-hairline-soft">
            <div className="page-zoom mx-auto flex h-14 max-w-[1440px] items-center justify-between px-16">
              <p className="text-xs font-medium tracking-[0.4px] text-raycast-accent-blue">
                02 · LOCAL MCP
              </p>
              <p className="text-sm text-raycast-mute">{caption}</p>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center overflow-hidden">
            <div className="mx-auto w-full max-w-[calc(1440px*var(--page-zoom))]">
              <div className="mcp-stage relative h-[720px] w-full origin-left">
                <div className="pointer-events-none absolute top-0 left-12 select-none">
                  <ChatPopup phase={phase} progress={progress} />
                </div>
                <div className="absolute top-16 left-[448px]">
                  <DataFlow flow={flow} progress={progress} scene={scene} />
                </div>
                <div
                  className="pointer-events-none absolute top-[266px] left-[780px] flex w-[200px] flex-col items-center gap-4 select-none"
                  style={{
                    transform:
                      flow === "lookup"
                        ? `scale(${1 + progress * 0.03})`
                        : "scale(1)",
                  }}
                >
                  <div
                    className="size-40 shrink-0 rounded-[28px]"
                    style={{ boxShadow: engineGlow(flow, progress) }}
                  >
                    <DatabaseIcon className="size-40" />
                  </div>
                  <span className="text-sm leading-[13px] font-medium tracking-[0.2px] text-raycast-mute">
                    Amie · this Mac
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
