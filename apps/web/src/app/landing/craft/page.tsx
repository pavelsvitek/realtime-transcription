import type { Metadata } from "next";
import { CraftLanding } from "@/components/landing/craft-landing";

export const metadata: Metadata = {
  title: "Meetings, transcribed on your Mac",
  description: "No bot in the call. A transcript when you hang up.",
};

export default function CraftPage() {
  return <CraftLanding />;
}
