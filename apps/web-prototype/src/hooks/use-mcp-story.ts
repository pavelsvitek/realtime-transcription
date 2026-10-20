"use client";

import { useEffect, useState, type RefObject } from "react";

export type McpPhase =
  | "query1"
  | "request1"
  | "lookup1"
  | "reply1"
  | "response1"
  | "query2"
  | "request2"
  | "lookup2"
  | "reply2"
  | "response2";

export type McpFlow = "idle" | "request" | "lookup" | "reply";

export const MCP_BEATS: { phase: McpPhase; weight: number; caption: string }[] =
  [
    { phase: "query1", weight: 0.08, caption: "1 / 2 · Find meetings" },
    { phase: "request1", weight: 0.1, caption: "1 / 2 · Request → Amie" },
    { phase: "lookup1", weight: 0.08, caption: "1 / 2 · Amie looks it up" },
    { phase: "reply1", weight: 0.1, caption: "1 / 2 · Reply ← Cowork" },
    { phase: "response1", weight: 0.12, caption: "1 / 2 · Two meetings" },
    { phase: "query2", weight: 0.08, caption: "2 / 2 · Show decisions" },
    { phase: "request2", weight: 0.1, caption: "2 / 2 · Request → Amie" },
    { phase: "lookup2", weight: 0.08, caption: "2 / 2 · Amie looks it up" },
    { phase: "reply2", weight: 0.1, caption: "2 / 2 · Reply ← Cowork" },
    { phase: "response2", weight: 0.16, caption: "2 / 2 · Decisions in Cowork" },
  ];

export type McpStory = {
  phase: McpPhase;
  progress: number;
  scene: number;
  caption: string;
  flow: McpFlow;
  turn: 1 | 2;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mcpFlow(phase: McpPhase): McpFlow {
  if (phase.startsWith("request")) return "request";
  if (phase.startsWith("lookup")) return "lookup";
  if (phase.startsWith("reply")) return "reply";
  return "idle";
}

export function storyFromScene(scene: number): McpStory {
  const p = clamp(scene, 0, 1);
  let acc = 0;
  for (const beat of MCP_BEATS) {
    const next = acc + beat.weight;
    const isLast = beat.phase === "response2";
    if (p < next || isLast) {
      return {
        phase: beat.phase,
        progress: clamp((p - acc) / beat.weight, 0, 1),
        scene: p,
        caption: beat.caption,
        flow: mcpFlow(beat.phase),
        turn: beat.phase.endsWith("2") ? 2 : 1,
      };
    }
    acc = next;
  }
  const last = MCP_BEATS[MCP_BEATS.length - 1];
  return {
    phase: last.phase,
    progress: 1,
    scene: 1,
    caption: last.caption,
    flow: "idle",
    turn: 2,
  };
}

function sceneFromTrack(track: HTMLElement) {
  const rect = track.getBoundingClientRect();
  const range = track.offsetHeight - window.innerHeight;
  if (range <= 0) return 0;
  return clamp(-rect.top / range, 0, 1);
}

export function useMcpStory(trackRef: RefObject<HTMLElement | null>): McpStory {
  const [scene, setScene] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      setScene(sceneFromTrack(track));
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    raf = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [trackRef]);

  return storyFromScene(scene);
}
