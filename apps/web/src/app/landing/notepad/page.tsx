import type { Metadata } from "next";
import { NotepadLanding } from "@/components/landing/notepad-landing";

export const metadata: Metadata = {
  title: "The notepad for Zoom, Meet, and Teams",
  description:
    "Video calls transcribed on your Mac. No bot in Google Meet, Zoom, or Microsoft Teams.",
};

export default function NotepadPage() {
  return <NotepadLanding />;
}
