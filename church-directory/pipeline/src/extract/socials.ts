import * as cheerio from "cheerio";
import type { SocialPlatform } from "../schema.js";

/**
 * Matchers are ordered: the first hit wins, so the more specific host patterns
 * (fb.me, youtu.be) come before their generic siblings. Intent is to capture
 * the parish's own account, not every social link on the page, so tracking,
 * share, and login URLs are filtered out below.
 */
const MATCHERS: { platform: SocialPlatform; re: RegExp; handle?: RegExp }[] = [
  { platform: "facebook", re: /^https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com|fb\.me)\//i, handle: /facebook\.com\/(?:pg\/|pages\/[^/]+\/)?([A-Za-z0-9._-]+)/i },
  { platform: "instagram", re: /^https?:\/\/(?:www\.)?instagram\.com\//i, handle: /instagram\.com\/([A-Za-z0-9._]+)/i },
  { platform: "youtube", re: /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i, handle: /youtube\.com\/(?:@|c\/|channel\/|user\/)([A-Za-z0-9._-]+)/i },
  { platform: "x", re: /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\//i, handle: /(?:twitter|x)\.com\/([A-Za-z0-9_]+)/i },
  { platform: "tiktok", re: /^https?:\/\/(?:www\.)?tiktok\.com\//i, handle: /tiktok\.com\/@([A-Za-z0-9._]+)/i },
  { platform: "whatsapp", re: /^https?:\/\/(?:chat\.whatsapp\.com|wa\.me)\//i },
  { platform: "telegram", re: /^https?:\/\/(?:t\.me|telegram\.me)\//i },
  { platform: "linkedin", re: /^https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\//i },
  { platform: "flickr", re: /^https?:\/\/(?:www\.)?flickr\.com\//i },
  { platform: "soundcloud", re: /^https?:\/\/(?:www\.)?soundcloud\.com\//i },
  { platform: "spotify", re: /^https?:\/\/open\.spotify\.com\//i },
  { platform: "podcast", re: /^https?:\/\/podcasts\.apple\.com\//i },
];

/** Paths that are share widgets, auth flows, or platform chrome, not accounts. */
const NOT_AN_ACCOUNT =
  /\/(sharer|share|dialog|plugins|tr\?|login|signup|policies|privacy|terms|help|about|watch\?|intent\/|hashtag\/|search|explore|results\?)/i;

export interface FoundSocial {
  platform: SocialPlatform;
  url: string;
  handle?: string;
}

export function extractSocials(html: string, baseUrl: string): FoundSocial[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, FoundSocial>();

  const consider = (href: string | undefined) => {
    if (!href) return;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (NOT_AN_ACCOUNT.test(abs)) return;
    for (const m of MATCHERS) {
      if (!m.re.test(abs)) continue;
      const handle = m.handle ? abs.match(m.handle)?.[1] : undefined;
      // Bare platform roots ("facebook.com/") carry no account.
      if (m.handle && !handle) return;
      const key = `${m.platform}:${(handle ?? abs).toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { platform: m.platform, url: abs, handle });
      return;
    }
  };

  $("a[href]").each((_, el) => consider($(el).attr("href")));
  // rel="me" and social meta tags are the explicit, self-declared version.
  $('link[rel~="me"][href]').each((_, el) => consider($(el).attr("href")));
  $('meta[property="og:see_also"], meta[name="twitter:site"]').each((_, el) => {
    const v = $(el).attr("content");
    if (v?.startsWith("@")) consider(`https://x.com/${v.slice(1)}`);
    else consider(v);
  });

  return [...seen.values()];
}

/** Feed URLs worth handing to the events step. */
export function extractFeeds(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const feeds = new Map<string, { type: "ical" | "rss"; url: string }>();

  const add = (type: "ical" | "rss", href?: string) => {
    if (!href) return;
    try {
      const url = new URL(href, baseUrl).toString();
      feeds.set(url, { type, url });
    } catch {
      /* ignore unparseable hrefs */
    }
  };

  $('link[type="application/rss+xml"], link[type="application/atom+xml"]').each((_, el) =>
    add("rss", $(el).attr("href")),
  );
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (/\.ics(\?|$)/i.test(href) || /webcal:\/\//i.test(href) || /ical=1|format=ical/i.test(href)) {
      add("ical", href.replace(/^webcal:/i, "https:"));
    } else if (/\/(feed|rss)\/?(\?|$)/i.test(href)) {
      add("rss", href);
    }
  });

  return [...feeds.values()];
}
