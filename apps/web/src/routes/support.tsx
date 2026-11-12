import { createFileRoute } from "@tanstack/react-router";
import { SiteLink as Link } from "@/components/site/site-link";

import {
  LegalPage,
  SupportEmail,
  type LegalSection,
} from "@/components/legal/legal-page";
import { seo } from "@/lib/seo";

const sections: LegalSection[] = [
  {
    id: "contact",
    title: "Contact us",
    body: (
      <>
        <p className="legal-callout">
          Email <SupportEmail /> with any question
          or problem.
        </p>
        <p>To help us help you faster, include:</p>
        <ul>
          <li>your macOS version and Mac model;</li>
          <li>your Amie version;</li>
          <li>
            whether you were using the microphone, system audio or both, and
            which meeting app; and
          </li>
          <li>what you expected to happen, and what happened instead.</li>
        </ul>
        <p>
          Please don’t send transcripts or recordings unless we ask. They often
          contain other people’s words.
        </p>
      </>
    ),
  },
  {
    id: "requirements",
    title: "What you need",
    body: (
      <ul>
        <li>macOS 15 or later.</li>
        <li>A Mac with Apple silicon is recommended.</li>
        <li>
          Enough free disk space for the speech model, which Amie downloads
          the first time it starts.
        </li>
      </ul>
    ),
  },
  {
    id: "permissions",
    title: "Permissions",
    body: (
      <>
        <p>
          macOS asks you to allow each of these the first time Amie needs it:
        </p>
        <ul>
          <li>
            <strong>Microphone</strong> to transcribe what you say.
          </li>
          <li>
            <strong>System Audio Recording</strong> to transcribe the other
            people on a call.
          </li>
          <li>
            <strong>Accessibility</strong> (optional) to show who is speaking
            in Zoom and Microsoft Teams. You can turn it on from Settings in
            Amie.
          </li>
        </ul>
        <h3>The other side of the call isn’t transcribed</h3>
        <p>
          Open <strong>System Settings → Privacy &amp; Security → System Audio
          Recording Only</strong> (called <strong>Screen &amp; System Audio
          Recording</strong> on some macOS versions), turn on Amie, then quit
          and reopen Amie.
        </p>
      </>
    ),
  },
  {
    id: "google-meet",
    title: "Speaker names in Google Meet",
    body: (
      <>
        <p>
          Install the <strong>Amie for Google Meet</strong> extension in Chrome
          or Brave, keep Amie running, and join a call. The extension connects
          once you’re in the call itself. The waiting room isn’t enough.
        </p>
        <ul>
          <li>
            Click the extension’s icon. It should say{" "}
            <strong>Connected</strong> and show your Amie version.
          </li>
          <li>
            If it says <strong>Not connected</strong>, check that Amie is open
            and that you’re in the call, not the lobby.
          </li>
          <li>
            If the extension disconnects mid‑call, new lines from other people
            show up without names after a couple of seconds. They get names
            again when it reconnects.
          </li>
        </ul>
        <p>
          When you mute yourself in Meet, Amie stops transcribing your
          microphone too.
        </p>
      </>
    ),
  },
  {
    id: "cloud",
    title: "Cloud transcription and summaries",
    body: (
      <p>
        Amie transcribes on your Mac by default. To use xAI for transcription,
        or xAI, OpenAI or Google Gemini for meeting summaries, add your own API
        key in Amie’s Settings and pick the provider. Usage is billed to your
        account with that provider. See the{" "}
        <Link href="/privacy#optional-cloud">Privacy Policy</Link> for what
        gets sent.
      </p>
    ),
  },
  {
    id: "your-data",
    title: "Your data",
    body: (
      <>
        <p>
          Meetings are stored on your Mac in{" "}
          <code>~/Library/Application Support/com.pavel.amie/</code>.
        </p>
        <ul>
          <li>
            <strong>Delete one meeting:</strong> open it in Amie and choose
            Delete. This can’t be undone. Choose Archive instead to hide it but
            keep it.
          </li>
          <li>
            <strong>Delete everything:</strong> quit Amie, then delete the
            folder above. Uninstalling Amie does not delete it for you.
          </li>
        </ul>
        <p>
          We don’t have a copy of your meetings, so we can’t recover anything
          you delete. Back up your Mac if you want to keep them.
        </p>
      </>
    ),
  },
  {
    id: "privacy-requests",
    title: "Privacy requests",
    body: (
      <p>
        To ask about, correct or delete personal data we hold about you, email{" "}
        <SupportEmail />. Your rights are explained in
        the <Link href="/privacy#your-rights">Privacy Policy</Link>.
      </p>
    ),
  },
];

function SupportPage() {
  return (
    <LegalPage
      eyebrow="Help"
      title="Support"
      lastUpdated="November 12, 2026"
      intro={
        <p>
          Stuck, or something not working? Start with the answers below, or
          email us and we’ll help.
        </p>
      }
      sections={sections}
    />
  );
}

export const Route = createFileRoute("/support")({
  head: () =>
    seo({
      title: "Support — Amie",
      description: "Get help with Amie: contact us, set up permissions, connect Google Meet and manage your data.",
      path: "/support",
    }),
  component: SupportPage,
});
