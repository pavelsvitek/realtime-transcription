import type { Metadata } from "next";
import { TrustLanding } from "@/components/landing/trust-landing";

export const metadata: Metadata = {
  title: "Your meetings stay on this Mac",
  description:
    "On-device SQLite capture. No bot in the call. Cloud STT is optional.",
};

export default function TrustPage() {
  return <TrustLanding />;
}
