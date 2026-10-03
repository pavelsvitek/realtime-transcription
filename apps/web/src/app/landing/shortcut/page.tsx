import type { Metadata } from "next";
import { ShortcutLanding } from "@/components/landing/shortcut-landing";

export const metadata: Metadata = {
  title: "Start a meeting with ⌘N",
  description: "Keyboard-first Mac meeting recorder. No bot. No tab.",
};

export default function ShortcutPage() {
  return <ShortcutLanding />;
}
