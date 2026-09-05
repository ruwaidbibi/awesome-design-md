import { config } from "../config.js";
import { alternateUrl, classifyByHost, hostOf, looksParked, socialPlatform, isDirectory } from "./classify.js";

const UA = "Mozilla/5.0 (compatible; leadsites/0.1; +local lead research)";
const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url, init = {}, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,*/*" },
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Map a fetch rejection onto a status we can defend. */
function classifyNetworkError(err) {
  const code = err?.cause?.code ?? err?.code ?? "";
  if (err?.name === "AbortError" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "ETIMEDOUT") {
    return { status: "unreachable", reason: `Request timed out after ${TIMEOUT_MS / 1000}s` };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return { status: "dead", reason: "Domain does not resolve in DNS" };
  }
  if (code === "ECONNREFUSED") {
    return { status: "dead", reason: "Connection refused - nothing is serving this domain" };
  }
  // TLS failures, resets, proxy interference: real, but not proof of a dead site.
  return {
    status: "unreachable",
    reason: `Could not connect (${code || err?.message || "unknown error"}) - check manually`,
  };
}

/**
 * Decide whether a business really has no website.
 *
 * Order matters: hosts we recognise are judged without spending a request, and
 * only an unknown host is actually fetched. A URL that redirects onto a social
 * or directory host is reclassified by where it landed, not where it started.
 */
export async function validateWebsite(websiteUri) {
  const base = { checked_at: new Date().toISOString(), http_status: null, final_url: null };

  const byHost = classifyByHost(websiteUri);
  if (byHost) return { ...base, ...byHost, final_url: websiteUri ?? null };

  let res;
  let probedUrl = websiteUri;
  let listedUrlBroken = false;

  try {
    res = await fetchWithTimeout(websiteUri);
  } catch (err) {
    const failure = classifyNetworkError(err);

    // A DNS failure on one host form proves nothing until the other form has
    // failed too: a missing www record is not a dead business.
    const alternate = failure.status === "dead" ? alternateUrl(websiteUri) : null;
    if (!alternate) return { ...base, ...failure, final_url: websiteUri };

    try {
      res = await fetchWithTimeout(alternate);
      probedUrl = alternate;
      listedUrlBroken = true;
    } catch {
      return {
        ...base,
        ...failure,
        reason: `${failure.reason} (neither ${hostOf(websiteUri)} nor ${hostOf(alternate)} resolves)`,
        final_url: websiteUri,
      };
    }
  }

  const finalUrl = res.url || probedUrl;
  const brokenNote = listedUrlBroken
    ? ` The URL Google lists (${websiteUri}) does not resolve, so anyone clicking through from Maps gets nothing.`
    : "";

  const landed = classifyByHost(finalUrl);
  if (landed && landed.status !== "none") {
    return {
      ...base,
      ...landed,
      reason: `${landed.reason} after redirect from ${hostOf(websiteUri)}.${brokenNote}`,
      http_status: res.status,
      final_url: finalUrl,
      listed_url_broken: listedUrlBroken,
    };
  }

  if (res.status >= 400) {
    // 401/403/406/429 almost always mean a bot filter, not an absent site, so
    // they are "go look yourself", never "this business has no website".
    const blocked = [401, 403, 405, 406, 429].includes(res.status);
    return {
      ...base,
      status: blocked || res.status >= 500 ? "unreachable" : "dead",
      reason: (blocked
        ? `Site refused our request (HTTP ${res.status}) - it likely exists behind a bot filter, check manually.`
        : `Server returned HTTP ${res.status}.`) + brokenNote,
      http_status: res.status,
      final_url: finalUrl,
      listed_url_broken: listedUrlBroken,
    };
  }

  let html = "";
  try {
    html = (await res.text()).slice(0, 200_000);
  } catch {
    /* body unreadable; fall through and treat as live */
  }

  const parked = looksParked(html, finalUrl);
  if (parked.parked) {
    return {
      ...base,
      status: "parked",
      reason: `Domain resolves but the page is a placeholder - ${parked.evidence}.${brokenNote}`,
      http_status: res.status,
      final_url: finalUrl,
      listed_url_broken: listedUrlBroken,
    };
  }

  return {
    ...base,
    status: "live",
    reason: `Real website found at ${hostOf(finalUrl)} (HTTP ${res.status}).${brokenNote}`,
    http_status: res.status,
    final_url: finalUrl,
    listed_url_broken: listedUrlBroken,
  };
}

/* ------------------------------- socials --------------------------------- */

const SOCIAL_URL_RE =
  /https?:\/\/(?:[a-z0-9-]+\.)*(?:facebook|instagram|tiktok|linkedin|nextdoor|x|twitter)\.com\/[A-Za-z0-9_.\-/]+/gi;

const dedupe = (socials) => {
  const seen = new Map();
  for (const s of socials) {
    const key = `${s.platform}:${s.url.toLowerCase().replace(/\/+$/, "")}`;
    const existing = seen.get(key);
    if (!existing || CONFIDENCE_RANK[s.confidence] > CONFIDENCE_RANK[existing.confidence]) {
      seen.set(key, s);
    }
  }
  return [...seen.values()];
};

const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };

async function searchWeb(query) {
  if (config.social.braveKey) {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "10");
    const res = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "X-Subscription-Token": config.social.braveKey },
    });
    if (!res.ok) throw new Error(`Brave search returned ${res.status}`);
    const json = await res.json();
    return (json?.web?.results ?? []).map((r) => ({ url: r.url, title: r.title, snippet: r.description }));
  }

  if (config.social.serpApiKey) {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("q", query);
    url.searchParams.set("engine", "google");
    url.searchParams.set("num", "10");
    url.searchParams.set("api_key", config.social.serpApiKey);
    const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`SerpApi returned ${res.status}`);
    const json = await res.json();
    return (json?.organic_results ?? []).map((r) => ({ url: r.link, title: r.title, snippet: r.snippet }));
  }

  return null; // no search provider configured
}

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function handleCandidates(name) {
  const base = slugify(name);
  const words = base.split(" ").filter(Boolean);
  const joined = words.join("");
  const candidates = new Set([joined]);
  if (words.length > 1) candidates.add(words.slice(0, 2).join(""));
  return [...candidates].filter((c) => c.length >= 5 && c.length <= 30);
}

/**
 * Probe guessed handles. Off by default: platforms rate limit and soft-404, so
 * this only ever produces a low-confidence hint that a human should eyeball.
 */
async function guessHandles(name) {
  const found = [];
  for (const handle of handleCandidates(name)) {
    for (const [platform, url] of [
      ["instagram", `https://www.instagram.com/${handle}/`],
      ["facebook", `https://www.facebook.com/${handle}`],
    ]) {
      try {
        const res = await fetchWithTimeout(url, { method: "GET" }, 6000);
        if (res.status === 200) {
          const body = (await res.text()).slice(0, 20_000).toLowerCase();
          // Both platforms answer 200 for missing profiles, so read the page.
          if (!body.includes("page isn't available") && !body.includes("page not found")) {
            found.push({ platform, url, source: "handle-guess", confidence: "low" });
          }
        }
      } catch {
        /* a guess that fails to load tells us nothing */
      }
    }
  }
  return found;
}

/**
 * Find social profiles for a business. Every result records where it came from
 * and how much to trust it; nothing here is inferred without evidence.
 */
export async function discoverSocials(business) {
  const socials = [];
  const notes = [];

  const platform = socialPlatform(business.website_uri);
  if (platform) {
    socials.push({
      platform,
      url: business.website_uri,
      source: "google-places",
      confidence: "high",
    });
  }

  const query = `"${business.name}" ${business.address?.split(",")[1]?.trim() ?? ""} facebook instagram`;
  let results = null;
  try {
    results = await searchWeb(query.trim());
  } catch (err) {
    notes.push(`Web search failed: ${err.message}`);
  }

  if (results == null) {
    notes.push(
      "No web search provider configured - set BRAVE_SEARCH_KEY or SERPAPI_KEY to search beyond what Google Places lists.",
    );
  } else {
    const nameTokens = slugify(business.name).split(" ").filter((w) => w.length > 3);
    for (const result of results) {
      const blob = `${result.url} ${result.title ?? ""} ${result.snippet ?? ""}`;
      for (const match of blob.match(SOCIAL_URL_RE) ?? []) {
        const p = socialPlatform(match);
        if (!p) continue;
        // Require the business name to actually appear, or it is somebody else's page.
        const haystack = `${match} ${result.title ?? ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
        const hit = nameTokens.some((t) => haystack.includes(t.replace(/[^a-z0-9]/g, "")));
        socials.push({
          platform: p,
          url: match.replace(/[).,]+$/, ""),
          source: "web-search",
          confidence: hit ? "medium" : "low",
        });
      }
      if (result.url && !socialPlatform(result.url) && !isDirectory(result.url)) {
        notes.push(`Search also surfaced a non-social domain worth checking: ${result.url}`);
      }
    }
  }

  if (config.social.guess) {
    socials.push(...(await guessHandles(business.name)));
  } else {
    notes.push("Handle guessing is off (SOCIAL_GUESS=true enables it).");
  }

  return { socials: dedupe(socials), notes: [...new Set(notes)].slice(0, 6) };
}
