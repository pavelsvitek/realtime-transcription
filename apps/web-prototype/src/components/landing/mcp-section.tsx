"use client";

import { useEffect, useRef, useState } from "react";
import { ChatPopup } from "@/components/landing/chat-popup";
import { DataFlow } from "@/components/landing/data-flow";
import { DatabaseIcon } from "@/components/landing/database-icon";
import { useMcpStory, type McpPhase } from "@/hooks/use-mcp-story";

function engineGlow(phase: McpPhase): string {
  if (phase === "lookup") {
    return "0 0 0 2px var(--color-raycast-accent-blue), 0 0 48px #57C1FF59";
  }
  if (phase === "request") {
    return "0 0 32px #57C1FF38";
  }
  return "none";
}

export function McpSection() {
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  const { phase, progress } = useMcpStory(active);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { threshold: 0.28 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="local-mcp"
      ref={rootRef}
      className="relative w-full pt-24 pb-20"
    >
      <div className="flex w-[560px] flex-col gap-5 px-16">
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

      <div className="relative mt-[70px] h-[720px] w-full">
        <div className="absolute top-0 left-12">
          <ChatPopup phase={phase} />
        </div>
        <div className="absolute top-16 left-[448px]">
          <DataFlow phase={phase} progress={progress} />
        </div>
        <div
          className="absolute top-[266px] left-[780px] flex w-[200px] flex-col items-center gap-4"
          style={{
            transition: "filter 280ms ease, transform 280ms ease",
            transform: phase === "lookup" ? "scale(1.03)" : "scale(1)",
          }}
        >
          <div
            className="size-40 shrink-0 rounded-[28px] transition-[box-shadow] duration-300"
            style={{ boxShadow: engineGlow(phase) }}
          >
            <DatabaseIcon className="size-40" />
          </div>
          <span className="text-sm leading-[13px] font-medium tracking-[0.2px] text-raycast-mute">
            Amie · this Mac
          </span>
        </div>
      </div>
    </section>
  );
}
