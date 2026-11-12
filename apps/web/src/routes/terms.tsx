import { createFileRoute } from "@tanstack/react-router";
import { SiteLink as Link } from "@/components/site/site-link";

import {
  LegalPage,
  Placeholder,
  SupportEmail,
  type LegalSection,
} from "@/components/legal/legal-page";
import { seo } from "@/lib/seo";

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "The agreement",
    body: (
      <>
        <p>
          These terms are an agreement between you and{" "}
          <Placeholder>COMPANY LEGAL NAME</Placeholder>,{" "}
          <Placeholder>REGISTERED ADDRESS</Placeholder> (“we”, “us”). They
          cover the Amie app for macOS, the Amie for Google Meet browser
          extension, the Amie MCP server and this website (together, “Amie”).
        </p>
        <p>
          By downloading, installing or using Amie, you agree to these terms.
          If you use Amie for an organization, you agree on its behalf and
          confirm you are allowed to. If you do not agree, do not use Amie.
        </p>
        <p>
          If you got Amie from the Mac App Store, Apple’s{" "}
          <a
            href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
            rel="noreferrer"
          >
            Licensed Application End User License Agreement
          </a>{" "}
          governs your license to the app. These terms apply alongside it, and
          if the two conflict, Apple’s agreement wins for the App Store copy.
        </p>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains how Amie
          handles data and is part of these terms.
        </p>
      </>
    ),
  },
  {
    id: "license",
    title: "Your license to use Amie",
    body: (
      <>
        <p>
          We give you a personal, non‑exclusive, non‑transferable, revocable
          license to install and use Amie on Macs you own or control, for your
          own personal or internal business use, as long as you follow these
          terms.
        </p>
        <p>You may not:</p>
        <ul>
          <li>sell, rent, sublicense or redistribute Amie;</li>
          <li>
            reverse engineer, decompile or disassemble Amie, except where the
            law allows it despite this restriction;
          </li>
          <li>remove or change any copyright or other notices; or</li>
          <li>
            use Amie to build a competing product, or get around any technical
            limits in it.
          </li>
        </ul>
        <p>
          Amie includes open‑source components and a third‑party speech model.
          They are licensed under their own terms, which are listed with the
          app. Where those terms conflict with these, those terms apply to that
          component.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and fees",
    body: (
      <>
        <p>
          Amie does not need an account. You do not sign up with us, and we do
          not hold login details for you.
        </p>
        <p>
          <Placeholder>PRICING AND PAYMENT TERMS</Placeholder>
        </p>
        <p>
          If we introduce accounts or paid plans, we will update these terms
          first, and any additional terms will be shown to you before you sign
          up or pay.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Recording and acceptable use",
    body: (
      <>
        <p className="legal-callout">
          <strong>Get consent before you transcribe a meeting.</strong> Amie
          writes down what everyone on a call says, not just you. Laws on
          recording conversations differ by country and state, and many require
          that every participant is told, or agrees, before a call is recorded
          or transcribed. You are responsible for knowing and following the
          rules that apply to you and the people you talk to.
        </p>
        <p>You agree not to use Amie to:</p>
        <ul>
          <li>
            record or transcribe anyone without the notice or consent the law
            requires;
          </li>
          <li>
            capture conversations you are not part of, or are not allowed to
            listen to;
          </li>
          <li>
            break the terms of a meeting service you use it with, such as Zoom,
            Microsoft Teams or Google Meet, or an employer’s or client’s
            confidentiality rules;
          </li>
          <li>
            harass, stalk or surveil anyone, or collect their personal data
            unlawfully; or
          </li>
          <li>do anything else that is illegal or infringes others’ rights.</li>
        </ul>
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    body: (
      <>
        <p>
          Your audio, transcripts, summaries and notes are yours. Amie stores
          them on your Mac, and we do not get a copy or any rights to them.
        </p>
        <p>
          Because your content lives on your Mac, you are responsible for
          backing it up. If you lose your Mac or delete Amie’s data, we cannot
          recover it.
        </p>
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third‑party services",
    body: (
      <>
        <p>Some optional features rely on services we do not run:</p>
        <ul>
          <li>
            cloud transcription and meeting summaries, which use your own API
            key with xAI, OpenAI or Google;
          </li>
          <li>
            Google Meet, Zoom and Microsoft Teams, which Amie reads speaker
            names from; and
          </li>
          <li>AI tools you connect to the Amie MCP server.</li>
        </ul>
        <p>
          Your use of those services is governed by their own terms, and you
          pay any fees they charge. We are not responsible for them, and they
          may change or stop working with Amie at any time.
        </p>
      </>
    ),
  },
  {
    id: "ai-output",
    title: "Transcripts and AI output",
    body: (
      <p>
        Speech recognition and AI summaries make mistakes. Words can be
        misheard, speakers mislabeled, and summaries can leave out or invent
        details. Check anything important against the source before you rely
        on it, especially for legal, medical, financial or employment
        decisions.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Our intellectual property",
    body: (
      <p>
        Amie, including its software, design, name and logo, belongs to us
        and our licensors and is protected by intellectual property laws.
        These terms do not give you any rights to it beyond the license above.
        If you send us feedback or ideas, we may use them without any
        obligation to you.
      </p>
    ),
  },
  {
    id: "updates",
    title: "Updates and changes to Amie",
    body: (
      <p>
        Amie gets updates to fix bugs, improve security or add features. The
        version from this website checks for updates itself. The Mac App Store
        version is updated through the App Store. We may also change or remove features, or
        stop offering Amie. If we stop, the version you already have will keep
        working on your Mac, but we will no longer support or update it.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <p>
        Amie is provided “as is” and “as available”. To the fullest extent the
        law allows, we make no warranties, express or implied, including
        warranties of merchantability, fitness for a particular purpose,
        accuracy and non‑infringement. We do not promise that Amie will be
        error‑free, uninterrupted, or that it will capture every word of every
        meeting. Some places do not allow these exclusions, so some of them may
        not apply to you.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <>
        <p>
          To the fullest extent the law allows, we are not liable for any
          indirect, incidental, special, consequential or punitive damages, or
          for lost profits, revenue, data or goodwill, arising from your use of
          Amie, even if we were told they were possible.
        </p>
        <p>
          Our total liability for any claim about Amie is limited to the
          greater of the amount you paid us for Amie in the 12 months before
          the claim, or <Placeholder>LIABILITY CAP AMOUNT</Placeholder>.
        </p>
        <p>
          Nothing in these terms limits liability that cannot be limited by
          law, such as for death or personal injury caused by negligence, or
          for fraud.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>
        If someone brings a claim against us because you used Amie in breach
        of these terms or the law, including by transcribing people without
        the consent you needed, you agree to cover our reasonable costs and
        losses from that claim, to the extent the law allows.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    body: (
      <p>
        You can stop using Amie at any time by uninstalling it. We may end your
        license if you seriously or repeatedly break these terms. When the
        license ends, you must stop using Amie and delete it. Your meeting data
        stays on your Mac for you to keep or delete. Sections that by their
        nature should survive, including those on intellectual property,
        disclaimers, limitation of liability, indemnity and governing law, keep
        applying.
      </p>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of{" "}
        <Placeholder>GOVERNING LAW JURISDICTION</Placeholder>. Disputes will be
        handled by the courts of{" "}
        <Placeholder>COURTS / VENUE</Placeholder>. If you are a consumer, you
        also keep any protections, and any right to bring claims in your home
        courts, that the law where you live gives you.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. When we do, we will change the date at the
        top of this page, and for significant changes we will tell you in the
        app or the release notes before they take effect. If you keep using
        Amie after that, you accept the new terms.
      </p>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <p>
        These terms and the Privacy Policy are the whole agreement between you
        and us about Amie. If any part is found unenforceable, the rest still
        applies. If we do not enforce a term right away, we can still enforce
        it later. You may not transfer these terms without our consent. We may
        transfer them as part of a merger, acquisition or sale of assets.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these terms? Email{" "}
        <SupportEmail /> or write to{" "}
        <Placeholder>COMPANY LEGAL NAME</Placeholder>,{" "}
        <Placeholder>REGISTERED ADDRESS</Placeholder>.
      </p>
    ),
  },
];

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms and Conditions"
      lastUpdated="November 12, 2026"
      intro={
        <p>
          The rules for using Amie, in plain English. The short version: use it
          on your own Mac, tell people before you transcribe them, and your
          meetings stay yours.
        </p>
      }
      sections={sections}
    />
  );
}

export const Route = createFileRoute("/terms")({
  head: () =>
    seo({
      title: "Terms and Conditions — Amie",
      description: "The terms for using Amie, the Amie for Google Meet extension and this website.",
      path: "/terms",
    }),
  component: TermsPage,
});
