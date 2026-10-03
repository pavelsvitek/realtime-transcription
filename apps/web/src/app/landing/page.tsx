import type { Metadata } from "next";
import { IndexLanding } from "@/components/landing/index-landing";

export const metadata: Metadata = {
  title: "Landing variants",
  description: "Five Amie marketing landing page variants.",
};

export default function LandingIndexPage() {
  return <IndexLanding />;
}
