/**
 * Stage 1a - the competitive set.
 *
 * A site built from one business in isolation has no way to know whether what
 * it is about to say is a differentiator or the thing every rival says, or
 * whether the look it is about to use is the look four doors down already has.
 * That is the single biggest reason the commodity generators produce
 * interchangeable sites: they never look sideways.
 *
 * Everything here is deterministic. The set comes out of the businesses the
 * app has already scanned - no model call, no extra Places request. Rival
 * homepages are only read when the caller asks for it, and reading one is a
 * plain GET of a public page.
 */
import { db } from "../db.js";
import { hostOf } from "../pipeline/classify.js";

const EARTH_KM = 6371;

/** Great-circle distance in km. Good enough to say "within a few miles". */
export function distanceKm(a, b) {
  if ([a?.lat, a?.lng, b?.lat, b?.lng].some((v) => v == null)) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const median = (nums) => {
  if (nums.length === 0) return null;
  const s = [...nums].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const quantile = (nums, q) => {
  if (nums.length === 0) return null;
  const s = [...nums].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

const round = (n, places = 1) =>
  n == null ? null : Math.round(n * 10 ** places) / 10 ** places;

/**
 * Peers already in the database: the same trade, near enough to compete for
 * the same walk-in.
 *
 * Same `primary_type` is the strict test. Falling back to a shared entry in
 * `types_json` catches the case where Google files two barbershops under
 * "barber_shop" and "hair_care".
 */
export function findPeers(business, { radiusKm = 8, limit = 120 } = {}) {
  const rows = db
    .prepare(
      `SELECT id, name, lat, lng, rating, review_count, website_status, website_uri,
              primary_type, types_json, city, business_status
         FROM businesses
        WHERE id != ?
          AND review_count > 0
        ORDER BY review_count DESC
        LIMIT ?`,
    )
    .all(business.id, limit * 4);

  const myTypes = new Set(JSON.parse(business.types_json ?? "[]"));
  const sameTrade = (row) => {
    if (business.primary_type && row.primary_type === business.primary_type) return "primary-type";
    const theirs = JSON.parse(row.types_json ?? "[]");
    if (theirs.some((t) => myTypes.has(t) && t !== "point_of_interest" && t !== "establishment")) {
      return "shared-type";
    }
    return null;
  };

  const near = (row) => {
    const km = distanceKm(business, row);
    if (km == null) {
      // No coordinates on one side: fall back to the city label, which is the
      // only other thing that says these two compete for the same customer.
      return business.city && row.city === business.city ? { km: null, why: "same-city" } : null;
    }
    return km <= radiusKm ? { km, why: "distance" } : null;
  };

  const peers = [];
  for (const row of rows) {
    const trade = sameTrade(row);
    if (!trade) continue;
    const prox = near(row);
    if (!prox) continue;
    peers.push({ ...row, matchedOn: trade, km: round(prox.km, 1), proximity: prox.why });
    if (peers.length >= limit) break;
  }
  return peers;
}

/**
 * Where this business sits in its own market, as facts rather than adjectives.
 *
 * "Top 3% of 60 barbershops" is a claim a homepage may make, and it is only
 * sayable because the set was scanned. Anything this returns as null means we
 * do not know it, and nothing downstream may assert it.
 */
export function competitiveSet(business, { radiusKm = 8 } = {}) {
  const peers = findPeers(business, { radiusKm });

  if (peers.length < 4) {
    // Below this the percentile is noise and the differentiation read is
    // worthless. Say so rather than computing a number nobody should trust.
    return {
      basis: "insufficient",
      peerCount: peers.length,
      radiusKm,
      note:
        peers.length === 0
          ? "No peers of this trade have been scanned, so there is no competitive set. Nothing on the site may claim a ranking or a comparison."
          : `Only ${peers.length} peer(s) scanned - too few to rank against. Nothing on the site may claim a ranking or a comparison.`,
      peers,
    };
  }

  const reviews = peers.map((p) => p.review_count);
  const ratings = peers.map((p) => p.rating).filter((r) => r != null);

  const mine = business.review_count ?? 0;
  const beaten = reviews.filter((n) => n < mine).length;
  const rank = reviews.filter((n) => n > mine).length + 1;

  const withSite = peers.filter((p) => p.website_status === "live");
  const noSite = peers.filter((p) => ["none", "social_only", "directory_only", "dead", "parked"].includes(p.website_status));

  return {
    basis: "scanned-set",
    radiusKm,
    category: business.primary_type ?? null,
    area: business.city ?? null,
    // The set as the business experiences it: peers plus itself.
    setSize: peers.length + 1,
    peerCount: peers.length,
    rank,
    reviewPercentile: Math.round((beaten / peers.length) * 100),
    reviews: {
      mine,
      median: median(reviews),
      p75: quantile(reviews, 0.75),
      max: Math.max(...reviews),
    },
    rating: {
      mine: business.rating ?? null,
      median: median(ratings),
      max: ratings.length ? Math.max(...ratings) : null,
      beats: business.rating == null ? null : ratings.filter((r) => r < business.rating).length,
      rated: ratings.length,
    },
    websites: {
      live: withSite.length,
      missingOrBroken: noSite.length,
      unchecked: peers.length - withSite.length - noSite.length,
      // Who to read, if the caller wants the claims as well as the counts.
      liveUrls: withSite
        .filter((p) => p.website_uri)
        .sort((a, b) => b.review_count - a.review_count)
        .slice(0, 5)
        .map((p) => ({ name: p.name, url: p.website_uri, host: hostOf(p.website_uri), reviewCount: p.review_count })),
    },
    strongest: peers
      .slice(0, 8)
      .map((p) => ({
        name: p.name,
        rating: p.rating,
        reviewCount: p.review_count,
        websiteStatus: p.website_status,
        km: p.km,
      })),
  };
}

// ---------------------------------------------------------------------------
// Reading a rival's actual homepage
// ---------------------------------------------------------------------------

const BOOKING_HOSTS = [
  "booksy", "squareup", "square.site", "vagaro", "setmore", "calendly", "acuityscheduling",
  "schedulicity", "styleseat", "fresha", "mindbody", "opentable", "resy", "tock",
];
const ORDERING_HOSTS = [
  "doordash", "ubereats", "grubhub", "toasttab", "slicelife", "chownow", "clover", "postmates", "seamless",
];

const FEATURE_TESTS = [
  { id: "booking", label: "online booking", test: (h) => BOOKING_HOSTS.some((x) => h.includes(x)) || /\b(book (now|online|an appointment)|schedule (now|online|an appointment)|make an appointment)\b/i.test(h) },
  { id: "ordering", label: "online ordering", test: (h) => ORDERING_HOSTS.some((x) => h.includes(x)) || /\border (online|now|ahead)\b/i.test(h) },
  { id: "prices", label: "published prices", test: (h) => /\$\s?\d/.test(h) || /class=["'][^"']*\bprice/i.test(h) },
  { id: "services", label: "a service list", test: (h) => /\b(our )?services\b/i.test(h) },
  { id: "gallery", label: "a photo gallery", test: (h) => /\b(gallery|portfolio|our work)\b/i.test(h) || (h.match(/<img\b/gi)?.length ?? 0) >= 6 },
  { id: "testimonials", label: "testimonials", test: (h) => /\b(testimonial|what our (customers|clients) say|reviews)\b/i.test(h) },
  { id: "hours", label: "opening hours on the page", test: (h) => /\b(hours|open (today|mon|monday)|mon\s*[-–]\s*fri)\b/i.test(h) },
  { id: "form", label: "a contact form", test: (h) => /<form\b/i.test(h) && /<(input|textarea)\b/i.test(h) },
  { id: "map", label: "an embedded map", test: (h) => /maps\.google|google\.com\/maps\/embed|mapbox|openstreetmap/i.test(h) },
];

const STOP_HEADINGS = /^(home|menu|skip to( main)? content|navigation|search|close|about|contact|services|gallery|reviews|hours|location)$/i;

const stripTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;?/gi, " ").replace(/\s+/g, " ").trim();

/**
 * Read a rival's homepage HTML for the two things that matter to our own
 * decisions: what they all claim (so positioning can avoid it) and what they
 * all look like (so art direction can avoid that too).
 *
 * Pure, so it can be tested against a fixture without a network.
 */
export function profileHtml(html, url) {
  const lower = html.toLowerCase();

  const palette = {};
  for (const m of html.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let hex = m[1].toLowerCase();
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    palette[`#${hex}`] = (palette[`#${hex}`] ?? 0) + 1;
  }
  // Pure black and white are in every stylesheet ever written; they say nothing
  // about a brand.
  const colors = Object.entries(palette)
    .filter(([hex]) => !["#000000", "#ffffff"].includes(hex))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([hex, count]) => ({ hex, count }));

  const fonts = {};
  for (const m of html.matchAll(/font-family\s*:\s*([^;}"']+)/gi)) {
    const first = m[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
    if (first && !/^(inherit|initial|unset|var\()/i.test(first)) {
      fonts[first] = (fonts[first] ?? 0) + 1;
    }
  }
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"']*family=([^&"':]+)/gi)) {
    const name = decodeURIComponent(m[1]).replace(/\+/g, " ").split(":")[0];
    fonts[name] = (fonts[name] ?? 0) + 10; // an explicit webfont load outranks a CSS fallback
  }

  const headings = [...html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => stripTags(m[2]))
    .filter((t) => t.length > 2 && t.length < 120 && !STOP_HEADINGS.test(t));

  return {
    url,
    host: hostOf(url),
    title: stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "") || null,
    metaDescription:
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i.exec(html)?.[1]?.trim() ?? null,
    headings: headings.slice(0, 12),
    colors,
    fonts: Object.entries(fonts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name),
    features: FEATURE_TESTS.filter((f) => f.test(lower)).map((f) => f.id),
    bytes: Buffer.byteLength(html),
  };
}

const UA = "Mozilla/5.0 (compatible; leadsites/0.1; +local market research)";
const MAX_BYTES = 1_500_000;

/** One rival homepage, read once. Failure is reported, never thrown. */
export async function profileRival(url, { timeoutMs = 10_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,*/*" },
      signal: controller.signal,
    });
    if (!res.ok) return { url, host: hostOf(url), error: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (!/html/i.test(type)) return { url, host: hostOf(url), error: `Not HTML (${type || "unknown"})` };
    const html = (await res.text()).slice(0, MAX_BYTES);
    return profileHtml(html, res.url || url);
  } catch (err) {
    return { url, host: hostOf(url), error: err?.cause?.code ?? err?.message ?? "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the rivals who *do* have sites have in common.
 *
 * Two different jobs come out of the same read. Features shared by most of them
 * are table stakes - absent, our site looks amateur. Colours and type shared by
 * most of them are the opposite: matching them makes the business invisible.
 */
export function summarizeRivals(profiles) {
  const ok = profiles.filter((p) => p && !p.error);
  if (ok.length === 0) {
    return { basis: "not-researched", read: 0, failed: profiles.length, tableStakes: null, note: "No rival homepage could be read, so nothing here is observed. Do not assert what rivals do or do not do." };
  }

  const tally = (items) => {
    const counts = {};
    for (const it of items) counts[it] = (counts[it] ?? 0) + 1;
    return counts;
  };

  const featureCounts = tally(ok.flatMap((p) => p.features));
  const majority = Math.ceil(ok.length / 2);

  const hueOf = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    if (d < 0.08) return max > 0.75 ? "near-white" : max < 0.25 ? "near-black" : "grey";
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const deg = h * 60;
    // Coarse on purpose. The question is "do several rivals look like each
    // other", and two shades of gold a few degrees apart answer yes - a
    // boundary between them would split the very case this is looking for.
    if (deg < 20 || deg >= 345) return "red";
    if (deg < 50) return "amber";
    if (deg < 70) return "yellow";
    if (deg < 160) return "green";
    if (deg < 200) return "teal";
    if (deg < 255) return "blue";
    if (deg < 290) return "purple";
    return "pink";
  };

  const hueCounts = tally(ok.flatMap((p) => [...new Set(p.colors.slice(0, 4).map((c) => hueOf(c.hex)))]));
  const fontCounts = tally(ok.flatMap((p) => [...new Set(p.fonts)]));

  const shared = (counts) =>
    Object.entries(counts)
      .filter(([, n]) => n >= majority)
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => ({ name, of: ok.length, count: n }));

  return {
    basis: "observed",
    read: ok.length,
    failed: profiles.length - ok.length,
    // Only features a majority have. One rival doing something is not a norm.
    tableStakes: shared(featureCounts).map((f) => ({
      ...f,
      label: FEATURE_TESTS.find((t) => t.id === f.name)?.label ?? f.name,
    })),
    crowdedHues: shared(hueCounts),
    crowdedFonts: shared(fontCounts),
    claims: ok.flatMap((p) => p.headings.slice(0, 4)),
    titles: ok.map((p) => ({ host: p.host, title: p.title })),
  };
}

/**
 * Stage 1a end to end: the set from our own data, plus up to `fetch` rival
 * homepages read live. `fetch: 0` keeps it entirely offline.
 */
export async function researchCompetitors(business, { radiusKm = 8, fetch: toFetch = 3 } = {}) {
  const set = competitiveSet(business, { radiusKm });
  const urls = (set.websites?.liveUrls ?? []).slice(0, toFetch);

  const profiles = urls.length > 0 ? await Promise.all(urls.map((u) => profileRival(u.url))) : [];
  return { set, rivals: summarizeRivals(profiles), profiled: profiles };
}
