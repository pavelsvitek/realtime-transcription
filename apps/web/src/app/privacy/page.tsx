import type { Metadata } from "next";
import Link from "next/link";

import {
  LegalPage,
  Placeholder,
  type LegalSection,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Amie",
  description:
    "What Amie does with your audio, transcripts and meeting data. Local by default.",
};

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          Amie is made by <Placeholder>COMPANY LEGAL NAME</Placeholder>,{" "}
          <Placeholder>REGISTERED ADDRESS</Placeholder> (“we”, “us”). This
          policy covers the Amie app for macOS, the Amie for Google Meet
          browser extension, the Amie MCP server that ships with the app, and
          this website.
        </p>
        <p>
          Where data protection law uses the term, we are the controller only
          for the small amount of data that actually reaches us, which is
          described below. Meeting audio and transcripts stay on your Mac, so
          they are under your control, not ours.
        </p>
      </>
    ),
  },
  {
    id: "on-your-mac",
    title: "What stays on your Mac",
    body: (
      <>
        <p>
          Amie is built to work without a server. By default, everything below
          is processed and stored only on your computer:
        </p>
        <ul>
          <li>
            <strong>Audio.</strong> Amie listens to your microphone and, if you
            allow it, your Mac’s system audio. The audio goes to a speech model
            running on your Mac and is transcribed as it is spoken. Amie does
            not save audio recordings. When a meeting ends, only the text is
            kept.
          </li>
          <li>
            <strong>Transcripts and meetings.</strong> Transcripts, speaker
            labels, meeting titles, the context you add and summaries are
            stored in a database in Amie’s folder on your Mac (
            <code>~/Library/Application Support/com.pavel.amie/</code>).
          </li>
          <li>
            <strong>Speaker names.</strong> For Zoom and Microsoft Teams, Amie
            can use macOS Accessibility, if you allow it, to read who is
            speaking from the meeting window. For Google Meet, the browser
            extension does this (see{" "}
            <a href="#meet-extension">Amie for Google Meet</a>). Names are used
            to label transcript lines and are stored with the transcript.
          </li>
          <li>
            <strong>Settings and API keys.</strong> Your preferences, and any
            API keys you add for optional cloud features, are stored in Amie’s
            folder on your Mac. They are never sent to us.
          </li>
        </ul>
        <p className="legal-callout">
          We have no copy of your audio, transcripts or summaries, and we cannot
          see them, recover them or hand them to anyone.
        </p>
      </>
    ),
  },
  {
    id: "optional-cloud",
    title: "Optional cloud features",
    body: (
      <>
        <p>
          Some features use a third‑party AI service. They are off until you
          turn them on, and they use an API key from your own account with that
          provider. Data goes straight from your Mac to the provider. It does
          not pass through us.
        </p>
        <h3>Cloud transcription</h3>
        <p>
          You can switch transcription from the local model to xAI’s speech
          service. While it is selected, Amie streams meeting audio to xAI to be
          transcribed. If you never choose it, no audio leaves your Mac.
        </p>
        <h3>Meeting summaries</h3>
        <p>
          To write a summary, Amie sends the meeting’s transcript, with speaker
          labels and any context you added, to the provider you pick: xAI,
          OpenAI or Google (Gemini). Summaries only run once you have added a
          key for that provider.
        </p>
        <p>
          Once data is with a provider, their terms and privacy policy apply,
          including how long they keep it and whether they train on it. Check
          their policies before you turn these features on:{" "}
          <a href="https://x.ai/legal/privacy-policy" rel="noreferrer">
            xAI
          </a>
          ,{" "}
          <a href="https://openai.com/policies/privacy-policy" rel="noreferrer">
            OpenAI
          </a>
          ,{" "}
          <a href="https://policies.google.com/privacy" rel="noreferrer">
            Google
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "meet-extension",
    title: "Amie for Google Meet",
    body: (
      <>
        <p>
          The browser extension tells Amie who is speaking in a Google Meet
          call. Here is everything it does:
        </p>
        <ul>
          <li>
            It runs only on <code>meet.google.com</code>. While you are in a
            call, it reads participant display names, which tile is speaking
            and whether your own microphone is muted in Meet. It does not read
            chat, captions, video or audio.
          </li>
          <li>
            It sends that information only to the Amie app on the same Mac,
            over a local connection (<code>127.0.0.1</code>). It never sends it
            anywhere else. The connection is only open during a call.
          </li>
          <li>
            When you are muted in Meet, Amie stops transcribing your
            microphone, so muted speech is not written down.
          </li>
          <li>
            It keeps two technical values in the browser’s local extension
            storage: a random install ID and the port it last used to reach
            Amie.
          </li>
        </ul>
        <p>
          It asks for these browser permissions: access to{" "}
          <code>meet.google.com</code> pages, access to{" "}
          <code>http://127.0.0.1</code> to reach the Amie app, and{" "}
          <code>storage</code> for the two values above.
        </p>
      </>
    ),
  },
  {
    id: "mcp",
    title: "Local MCP",
    body: (
      <>
        <p>
          Amie includes an MCP server so AI tools such as Claude Code, Cursor
          or Codex can read your meetings. It runs on your Mac, opens no
          network port, and only works for the tools you connect to it
          yourself. It can read meetings, and unless you run it read‑only, it
          can edit titles, context and summaries and archive meetings. It
          cannot delete meetings or edit transcripts.
        </p>
        <p>
          When you connect an AI tool, that tool can pass what it reads to its
          own model provider. That is covered by the tool’s privacy policy,
          not this one.
        </p>
      </>
    ),
  },
  {
    id: "network",
    title: "Other network requests",
    body: (
      <>
        <p>Apart from the optional features above, the app connects to:</p>
        <ul>
          <li>
            <strong>The speech model download.</strong> On first run, Amie
            downloads its speech model from a public model repository. This is
            a normal file download. No meeting data is sent.
          </li>
          <li>
            <strong>Update checks.</strong> Amie checks GitHub for new
            releases and downloads updates from there. GitHub sees your IP
            address and the request, as with any download.
          </li>
        </ul>
        <p>
          The app has no analytics, no tracking and no crash reporting service
          built in. We do not run accounts, so there is no Amie login.
        </p>
      </>
    ),
  },
  {
    id: "website",
    title: "This website",
    body: (
      <>
        <p>
          This website does not use analytics, advertising or tracking cookies.
          It is hosted by <Placeholder>WEBSITE HOSTING PROVIDER</Placeholder>,
          which, like any web host, processes your IP address and standard
          request details to serve the pages and keep the service secure.
        </p>
        <p>
          If you email us, we receive your email address and whatever you
          write, and we use it to reply.
        </p>
      </>
    ),
  },
  {
    id: "legal-bases",
    title: "Why we process data",
    body: (
      <>
        <p>
          For the little data we do handle (website requests and emails you
          send us), we rely on our legitimate interest in running the website
          securely and answering you. We do not sell personal information, and
          we do not share it for cross‑context behavioral advertising.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long data is kept",
    body: (
      <>
        <ul>
          <li>
            <strong>On your Mac.</strong> Meetings stay until you delete them
            in Amie or delete Amie’s folder. Uninstalling the app does not
            delete that folder by itself.
          </li>
          <li>
            <strong>With AI providers.</strong> If you use the optional cloud
            features, the provider’s own retention policy applies.
          </li>
          <li>
            <strong>With us.</strong> Emails are kept as long as needed to deal
            with your request, then deleted within{" "}
            <Placeholder>EMAIL RETENTION PERIOD</Placeholder>. Hosting logs are
            kept for <Placeholder>HOSTING LOG RETENTION PERIOD</Placeholder>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "recording-others",
    title: "Recording other people",
    body: (
      <>
        <p>
          Amie transcribes everyone on a call, not just you. Many places
          require that every participant knows about, or agrees to, a
          recording or transcript. You are responsible for telling people and
          getting consent where the law requires it. See our{" "}
          <Link href="/terms#acceptable-use">Terms</Link>.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <p>
          Your meeting data is on your Mac, so you can view, export, correct or
          delete it yourself at any time, without asking us.
        </p>
        <p>
          For any personal data we hold about you, you can ask us to tell you
          what it is, give you a copy, correct it, delete it, or stop or limit
          how we use it. If you are in the EU, UK or a similar jurisdiction,
          these rights come from the GDPR. If you are a California resident,
          the CCPA gives you the right to know, delete and correct personal
          information, and the right not to be discriminated against for using
          these rights. We do not sell or share personal information, so there
          is nothing to opt out of.
        </p>
        <p>
          To make a request, email <Placeholder>CONTACT EMAIL</Placeholder>. We
          will answer within 30 days. You can also complain to your local data
          protection authority.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Because your meetings stay on your Mac, they are as safe as your Mac.
        Use a login password and turn on FileVault disk encryption. API keys
        you add are stored as files in Amie’s folder, readable by your macOS
        user account. Cloud features send data to providers over encrypted
        connections.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Amie is not meant for children under{" "}
        <Placeholder>MINIMUM AGE</Placeholder>, and we do not knowingly collect
        their personal data.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If we change how Amie handles data, we will update this page and the
        date at the top. If a change is significant, such as a new feature
        that sends data off your Mac by default, we will also tell you in the
        app or in the release notes before it takes effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about privacy? Email{" "}
        <Placeholder>CONTACT EMAIL</Placeholder> or write to{" "}
        <Placeholder>COMPANY LEGAL NAME</Placeholder>,{" "}
        <Placeholder>REGISTERED ADDRESS</Placeholder>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      lastUpdated="November 12, 2026"
      intro={
        <p>
          Amie transcribes your meetings on your Mac. Your audio and
          transcripts stay there unless you turn on a cloud feature. This page
          explains exactly what Amie touches, where it goes, and what you can
          do about it.
        </p>
      }
      sections={sections}
    />
  );
}
