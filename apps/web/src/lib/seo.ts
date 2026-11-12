import { OG_IMAGE, SITE_NAME, SITE_URL } from "./site";

/**
 * Title, description, canonical URL and Open Graph / Twitter card tags.
 * Covers Facebook, LinkedIn, X, Slack, iMessage, WhatsApp and Discord.
 * Image URLs must be absolute for crawlers, so they are built from SITE_URL.
 */
export function seo({ title, description, path }: { title: string; description: string; path: string }) {
  const url = `${SITE_URL}${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:locale", content: "en_US" },
      { property: "og:url", content: url },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: OG_IMAGE.url },
      { property: "og:image:secure_url", content: OG_IMAGE.url },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: String(OG_IMAGE.width) },
      { property: "og:image:height", content: String(OG_IMAGE.height) },
      { property: "og:image:alt", content: OG_IMAGE.alt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: OG_IMAGE.url },
      { name: "twitter:image:alt", content: OG_IMAGE.alt },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
