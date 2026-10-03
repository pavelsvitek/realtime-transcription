import type { Metadata } from "next";
import { LiveLanding } from "@/components/landing/live-landing";

export const metadata: Metadata = {
  title: "Live dual transcript",
  description: "User and Remote, as it happens. Nothing joins the call.",
};

export default function LivePage() {
  return <LiveLanding />;
}
