export const SITE_URL = "https://getamie.app";
export const SUPPORT_EMAIL = "support@getamie.app";
export const SITE_NAME = "Amie";
export const OG_IMAGE = {
  url: `${SITE_URL}/og.png`,
  width: 1200,
  height: 630,
  alt: "Amie — your meetings, transcribed on your Mac. Names every speaker. Works with Google Meet, Zoom and Microsoft Teams.",
};

/** Every public page. Drives both build-time prerendering and /sitemap.xml. */
export const PAGES = [
  { path: "/", changefreq: "weekly", priority: 1.0 },
  { path: "/support", changefreq: "monthly", priority: 0.6 },
  { path: "/privacy", changefreq: "yearly", priority: 0.3 },
  { path: "/terms", changefreq: "yearly", priority: 0.3 },
] as const;
