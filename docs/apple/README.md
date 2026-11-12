# Mac App Store listing requirements

What Amie needs before it can be listed on the Mac App Store. Researched on 2026-11-12 from Apple's developer documentation (sources at the end). Apple changes these pages often, so check the linked source before acting on a specific limit.

There are three parts:

- **[A) Web](#a-web):** pages and URLs that must exist on the marketing site.
- **[B) App Store listing materials](#b-app-store-listing-materials):** what goes into App Store Connect.
- **[C) App changes](#c-app-changes-needed-before-review):** conflicts in the current macOS app that would fail review.

Status key: ✅ done · 🟡 partly done · ⬜ not started · 🔒 needs a fact only the owner has.

## A) Web

| # | Requirement | Why | Status |
| --- | --- | --- | --- |
| A1 | **A public website on the company's own domain.** It must be live and have real content. Social media pages, near-empty sites and "domain for sale" pages are rejected. | Needed to enroll in the Developer Program as an organization. | 🟡 Domain is **getamie.app** (`SITE_URL` in `apps/web/src/lib/site.ts`, also the site's `metadataBase`). Still to do: deploy the site there. |
| A2 | **A work email address on that same domain.** | Enrollment requires a work email that matches the site's domain. It is also the contact address for the privacy policy, support and the EU DSA listing details. | ✅ **support@getamie.app** (`SUPPORT_EMAIL` in `apps/web/src/lib/site.ts`). The privacy policy, terms and support page all link to it. Check the mailbox actually receives mail. |
| A3 | **A public Privacy Policy URL** (required). It must say what data is collected and how, who it's shared with (third-party AI providers are named explicitly), how long it's kept, how to delete it, and how to withdraw consent. It must also be easy to reach **inside the app**. | Guideline 5.1.1(i); App Information → Privacy Policy URL. | 🟡 `/privacy` is written. Placeholders still need filling. The in-app link is an app task (see C7). |
| A4 | **A Support URL with real contact details** (required). | Guideline 1.5: "Make sure your app and its Support URL include an easy way to contact you." Some countries also require it by law. | ✅ `https://getamie.app/support`, linked from the footer. |
| A5 | **A Marketing URL** (optional). | Shown on the listing. | ✅ `https://getamie.app/`. |
| A6 | **A Privacy Choices URL** (optional): a page where people can see or delete their data. | App Privacy → Privacy Choices URL. | ✅ `https://getamie.app/privacy#your-rights`. |
| A7 | **Terms and license.** Apple's standard license agreement (EULA) applies to App Store apps unless you upload your own. | App Information → License Agreement. | 🟡 `/terms` says Apple's standard EULA applies to App Store copies. You still need to decide: Apple's standard license or a custom one. |
| A8 | **Legal text that is accurate for the App Store version.** App Store apps must get every update through the App Store (2.4.5(vii)). | The policy and terms describe the GitHub updater. | 🟡 Both pages now cover both channels. Check them again once the App Store build exists. |
| A9 | **The official "Download on the Mac App Store" badge** in place of the Download button, linking to the listing. | Apple marketing guidelines. | ⬜ Waits until the listing is live. |

## B) App Store listing materials

### Account and business

| Item | Notes |
| --- | --- |
| Apple Developer Program, **organization** membership | Needs a D‑U‑N‑S number, a legal entity (DBAs and trade names aren't accepted), and someone with authority to sign for the company. It costs 99 USD a year. The company's legal name is shown as the seller. |
| Paid Apps agreement, tax forms, bank details | Only if the app is paid or has in-app purchases. |
| EU Digital Services Act status | Everyone must declare trader or non-trader, even without EU distribution. Traders have their phone, email and address (taken from D‑U‑N‑S) shown publicly on the listing, and must upload a document proving the business name and address. |

### App information (shared by every version)

| Field | Limit or notes |
| --- | --- |
| Name | 2–30 characters |
| Subtitle | Up to 30 characters |
| Primary and secondary category | The primary category must match the one set in Xcode. Likely Productivity or Business. |
| Bundle ID | `com.pavel.amie`. It can't be changed after the first build is uploaded. |
| SKU | An internal reference code. It can't be changed. |
| Primary language | English |
| Age rating | Answered through a questionnaire. |
| Content rights | A declaration that you have the rights to third-party content in the app. |
| License agreement | Apple's standard EULA or a custom one (see A7). |
| Privacy Policy URL | Required: `https://getamie.app/privacy` (see A3). |

### Version page

| Field | Limit or notes |
| --- | --- |
| Screenshots (required) | 1–10, at 16:10: **1280×800, 1440×900, 2560×1600 or 2880×1800**. PNG or JPEG, with no transparency. |
| App previews (optional) | Up to 3. **1920×1080 landscape**, 15–30 seconds, H.264 or ProRes 422 HQ, at most 30 fps and 500 MB. |
| Description (required) | Up to 4,000 characters, plain text. |
| Keywords (required) | Up to 100 bytes. Don't repeat the app or company name, and don't use other companies' names. |
| Promotional text | Up to 170 characters. It can be changed without a new version. |
| Support URL (required) | `https://getamie.app/support` (see A4). |
| Marketing URL | `https://getamie.app/` (see A5). |
| Copyright (required) | For example, `2026 [COMPANY LEGAL NAME]`. |
| Version and release setting | Manual, automatic, or automatic on a date. |
| "What's New" | Required for every version after the first. Up to 4,000 characters. |
| App Review contact (required) | Name, email, and a phone number in international format. |
| App Review notes | Up to 4,000 bytes. There's no login, so no demo account is needed. Explain how to start a recording, where the recording indicator is, how cloud transcription and summaries work with the user's own API key, and how the Meet extension fits in. Reviewers may need a sample audio source. |

### Compliance forms

| Item | Notes |
| --- | --- |
| App Privacy questionnaire (the privacy label) | Data that's only processed on the Mac doesn't count as "collected." The cloud features, where users send audio or transcripts to xAI, OpenAI or Google with their own key, are a gray area. Apple's definition of "collect" points toward declaring them as **Audio Data** and **Other User Content** for App Functionality, not linked to the user and not used for tracking. Write down the decision. |
| Encryption export compliance | If the app only uses the encryption built into macOS (HTTPS), add `ITSAppUsesNonExemptEncryption = false` to Info.plist. That stops App Store Connect asking on every upload. |
| Pricing and countries | Choose the price and where the app is sold. |

### The build

- Sandboxed, signed for App Store distribution, and uploaded through Xcode or Transporter. Third-party installers aren't allowed (2.4.5(ii)).
- It contains the app icon and plain-language reasons for the microphone and system audio permissions (5.1.1(ii)).

## C) App changes needed before review

Conflicts between the current app (`apps/amie`) and Apple's review guidelines:

| # | What the app does now | Guideline | What has to change |
| --- | --- | --- | --- |
| C1 | Checks for updates and installs them from GitHub releases (`commands/updates.rs`) | 2.4.5(vii): updates must come from the App Store | Remove the updater from the App Store build. |
| C2 | Reads speaker names from Zoom and Teams through Accessibility | 2.4.5(i): the app must be sandboxed. Apple support staff say the Accessibility features aren't supported in sandboxed apps. | Turn this off in the App Store build, or find a sandbox-compatible approach. |
| C3 | Downloads the Nemotron speech model on first run | 2.4.5(iv), 2.5.2: apps may not download "resources to add functionality" | Bundle the model, or ask App Review first whether downloading model weights is acceptable. |
| C4 | Runs the bundled `nemotron-bridge` helper and ships the `amie_mcp` program | 2.4.5(ii): the app must be self-contained | Both must sit inside the app and be sandboxed. External AI tools start `amie_mcp`, so it would also have to reach the database in the app's sandbox folder. Needs a design. |
| C5 | Records everyone on a call | 2.5.14: explicit consent and a clear recording indicator are required | Check the consent step and the indicator while recording. |
| C6 | Sends transcripts or audio to xAI, OpenAI or Gemini | 5.1.2(i): disclose sharing with third-party AI and get explicit permission | Ask for permission in the app before the first send, not only in the policy. |
| C7 | Has no link to the privacy policy in the app | 5.1.1(i) | Link to `/privacy` from Settings or About. |
| C8 | The Meet extension connects to the app over `127.0.0.1` | Sandbox | Probably needs the `com.apple.security.network.server` entitlement. This is an inference and hasn't been tested. |

The usual route is **two builds**: a Developer ID build from the website that keeps every feature, and a cut-down, sandboxed App Store build.

## Sources

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App information fields](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Platform version fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications)
- [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Export compliance overview](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance)
- [Developer Program enrollment](https://developer.apple.com/programs/enroll/)
- [EU DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements)
- Accessibility in the sandbox: Apple Developer Forums threads [756130](https://developer.apple.com/forums/thread/756130), [810677](https://developer.apple.com/forums/thread/810677), [749494](https://developer.apple.com/forums/thread/749494)
