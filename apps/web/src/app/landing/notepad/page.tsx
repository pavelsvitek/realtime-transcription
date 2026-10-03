import type { Metadata } from "next";
import { cookies } from "next/headers";
import { NotepadLanding } from "@/components/landing/notepad-landing";

export const metadata: Metadata = {
  title: "The notepad for Zoom, Meet, and Teams",
  description:
    "Video calls transcribed on your Mac. No bot in Google Meet, Zoom, or Microsoft Teams.",
};

export default async function NotepadPage() {
  const theme = (await cookies()).get("amie-notepad-theme")?.value;
  return (
    <NotepadLanding initialTheme={theme === "light" ? "light" : "dark"} />
  );
}
