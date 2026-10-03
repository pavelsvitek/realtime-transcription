import type { Metadata } from "next";
import { SessionPage } from "@/components/session/session-page";

export const metadata: Metadata = {
  title: "Session playground",
  description: "Live conversation copilot — UI exploration",
};

export default function SessionRoute() {
  return <SessionPage />;
}
