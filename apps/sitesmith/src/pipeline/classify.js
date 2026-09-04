/**
 * Pure classification helpers. No network, so they are cheap to unit test and
 * cheap to reason about; the probing lives in validate.js.
 */

/** A profile page, not a website the business controls. */
export const SOCIAL_HOSTS = {
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "fb.me": "facebook",
  "instagram.com": "instagram",
  "twitter.com": "x",
  "x.com": "x",
  "tiktok.com": "tiktok",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "linkedin.com": "linkedin",
  "nextdoor.com": "nextdoor",
  "linktr.ee": "linktree",
  "beacons.ai": "linktree",
  "pinterest.com": "pinterest",
  "wa.me": "whatsapp",
  "t.me": "telegram",
};

/** Someone else's listing or ordering funnel, not a website either. */
export const DIRECTORY_HOSTS = [
  "yelp.com", "tripadvisor.com", "opentable.com", "resy.com", "zomato.com",
  "doordash.com", "ubereats.com", "grubhub.com", "seamless.com", "postmates.com",
  "order.online", "toasttab.com", "clover.com", "square.site", "chownow.com",
  "menufy.com", "slicelife.com", "beyondmenu.com", "eatstreet.com",
  "yellowpages.com", "bbb.org", "angi.com", "thumbtack.com", "houzz.com",
  "booksy.com", "vagaro.com", "styleseat.com", "fresha.com", "schedulicity.com",
  "groupon.com", "mapquest.com", "manta.com", "chamberofcommerce.com",
  "healthgrades.com", "zocdoc.com", "avvo.com", "apple.com", "google.com",
];

/** Strings that mean a domain is registered but not actually a website. */
const PARKED_MARKERS = [
  "this domain is for sale", "buy this domain", "domain for sale",
  "domain is parked", "parked domain", "parkingcrew", "sedoparking",
  "hugedomains", "afternic", "dan.com", "godaddy.com/domainsearch",
  "website coming soon", "site coming soon", "coming soon",
  "under construction", "account suspended", "default web page",
  "index of /", "apache2 ubuntu default page", "welcome to nginx",
];

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const matchesHost = (host, candidate) =>
  host === candidate || host.endsWith(`.${candidate}`);

export function socialPlatform(url) {
  const host = hostOf(url);
  if (!host) return null;
  for (const [candidate, platform] of Object.entries(SOCIAL_HOSTS)) {
    if (matchesHost(host, candidate)) return platform;
  }
  return null;
}

export const isDirectory = (url) => {
  const host = hostOf(url);
  return host ? DIRECTORY_HOSTS.some((d) => matchesHost(host, d)) : false;
};

/**
 * Classify a URL by its host alone. Returns null when the host tells us
 * nothing, meaning the URL has to be fetched before we can judge it.
 */
export function classifyByHost(url) {
  if (!url) return { status: "none", reason: "Google lists no website for this business" };
  const platform = socialPlatform(url);
  if (platform) {
    return { status: "social_only", reason: `Website field points at a ${platform} profile`, platform };
  }
  if (isDirectory(url)) {
    return { status: "directory_only", reason: `Website field points at ${hostOf(url)}, a third-party listing` };
  }
  return null;
}

/** Does fetched HTML look like a placeholder rather than a real site? */
export function looksParked(html, finalUrl) {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  for (const marker of PARKED_MARKERS) {
    // In the title it is decisive; in the body only on a page with no real content.
    if (title.includes(marker)) return { parked: true, evidence: `title: "${title.slice(0, 80)}"` };
    if (text.length < 1200 && text.includes(marker)) {
      return { parked: true, evidence: `thin page (${text.length} chars) containing "${marker}"` };
    }
  }

  const host = hostOf(finalUrl) ?? "";
  if (title && host && title === host) {
    return { parked: true, evidence: `title is just the domain name ("${title}")` };
  }
  if (text.length < 250) {
    return { parked: true, evidence: `page has only ${text.length} characters of text` };
  }
  return { parked: false };
}

/** Statuses that mean the business is worth approaching. */
export const LEAD_STATUSES = new Set(["none", "social_only", "directory_only", "dead", "parked"]);

const GAP_POINTS = {
  none: 25,
  dead: 22,
  parked: 22,
  directory_only: 18,
  social_only: 15,
  unreachable: 5,
  unchecked: 5,
  live: 0,
};

/**
 * Rank leads. Every term is returned so the UI can show why a row scored what
 * it did instead of presenting an opaque number.
 */
export function scoreBusiness(business, { socials = [] } = {}) {
  const reviews = business.review_count ?? 0;
  const rating = business.rating ?? 0;

  const reviewPoints = reviews <= 0 ? 0 : Math.min(1, Math.log10(reviews) / 3) * 40;
  const ratingPoints = rating <= 0 ? 0 : Math.max(0, Math.min(1, (rating - 3.5) / 1.5)) * 15;
  const gapPoints = GAP_POINTS[business.website_status] ?? 0;
  const phonePoints = business.phone ? 8 : 0;
  const socialPoints = socials.length > 0 ? 7 : 0;
  const closedPenalty = business.business_status && business.business_status !== "OPERATIONAL" ? -40 : 0;

  const breakdown = [
    { label: "Review volume", points: reviewPoints, detail: `${reviews} reviews` },
    { label: "Rating", points: ratingPoints, detail: rating ? `${rating.toFixed(1)} stars` : "no rating" },
    { label: "Website gap", points: gapPoints, detail: business.website_status },
    { label: "Reachable by phone", points: phonePoints, detail: business.phone ? business.phone : "no phone listed" },
    { label: "Existing social presence", points: socialPoints, detail: socials.length ? `${socials.length} profile(s)` : "none found" },
  ];
  if (closedPenalty) {
    breakdown.push({ label: "Not operational", points: closedPenalty, detail: business.business_status });
  }

  const total = breakdown.reduce((sum, term) => sum + term.points, 0);
  return {
    score: Math.round(Math.max(0, total) * 10) / 10,
    breakdown: breakdown.map((t) => ({ ...t, points: Math.round(t.points * 10) / 10 })),
  };
}
