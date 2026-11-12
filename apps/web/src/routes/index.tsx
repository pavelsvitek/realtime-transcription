import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/landing-page";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () =>
    seo({
      title: "Amie — your meetings, transcribed on your Mac",
      description:
        "Amie writes every word as it’s said, from your mic and your calls. Local by default.",
      path: "/",
    }),
  component: LandingPage,
});
