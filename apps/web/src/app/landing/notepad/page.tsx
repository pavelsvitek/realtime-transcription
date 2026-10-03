import type { Metadata } from "next";
import { NotepadLanding } from "@/components/landing/notepad-landing";

export const metadata: Metadata = {
  title: "The notepad for meetings",
  description: "No bot on the call. Transcript and summary stay on your Mac.",
};

export default function NotepadPage() {
  return <NotepadLanding />;
}
