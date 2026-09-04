import pLimit from "p-limit";
import * as cheerio from "cheerio";
import { fetchUrl } from "../net/fetcher.js";
import { extractSocials, extractFeeds } from "../extract/socials.js";
import { htmlToText } from "../extract/html-to-text.js";
import { extractServiceTimes, llmAvailable } from "../extract/llm.js";
import { store } from "../store.js";
import { uniqueBy } from "../util/dedupe.js";
import { log } from "../util/log.js";
import { config } from "../config.js";
import type { Parish, Provenance, SocialAccount } from "../schema.js";

/** Pages worth visiting on a parish site, in the order they usually pay off. */
const SUBPAGES = [
  "", "/contact", "/contact-us", "/about", "/about-us", "/connect",
  "/events", "/calendar", "/news", "/bulletin", "/schedule", "/services",
  "/liturgy", "/service-times", "/mass-times",
];

export interface EnrichOptions {
  jurisdiction?: string;
  tradition?: string;
  /** Only parishes with no socials recorded yet. */
  missingOnly?: boolean;
  llm?: boolean;
  fresh?: boolean;
  limit?: number;
}

/**
 * Visits each parish's own website and records: social accounts, calendar and
 * RSS feeds (consumed later by the events step), and the recurring service
 * schedule. The parish site is the authoritative source for all three, and it
 * is the only one that scales to a thousand parishes without an API key.
 */
export async function enrich(opts: EnrichOptions = {}): Promise<void> {
  const parishes = store.readParishes();
  let queue = parishes.filter((p) => p.website);
  if (opts.jurisdiction) queue = queue.filter((p) => p.jurisdictionId === opts.jurisdiction);
  if (opts.tradition) queue = queue.filter((p) => p.tradition === opts.tradition);
  if (opts.missingOnly) queue = queue.filter((p) => p.socials.length === 0);
  if (opts.limit) queue = queue.slice(0, opts.limit);

  if (!queue.length) {
    log.warn("no parishes with websites matched; run `harvest` first");
    return;
  }
  log.info(`enriching ${queue.length} parishes`);

  const byId = new Map(parishes.map((p) => [p.id, p]));
  const limit = pLimit(config.concurrency);
  let done = 0;

  await Promise.all(
    queue.map((parish) =>
      limit(async () => {
        const updated = await enrichOne(parish, opts);
        byId.set(parish.id, updated);
        if (++done % 25 === 0) log.info(`  ${done}/${queue.length}`);
      }),
    ),
  );

  store.writeParishes([...byId.values()]);
}

async function enrichOne(parish: Parish, opts: EnrichOptions): Promise<Parish> {
  const site = parish.website!;
  const socials: SocialAccount[] = [...parish.socials];
  const feeds = [...parish.feeds];
  let serviceTimes = parish.serviceTimes;
  let visited = 0;

  for (const path of SUBPAGES) {
    // Three useful pages is plenty; every extra request is a request against a
    // small volunteer-run server.
    if (visited >= 4) break;

    let url: string;
    try {
      url = new URL(path, site).toString();
    } catch {
      continue;
    }

    const page = await fetchUrl(url, { fresh: opts.fresh });
    if (!page || page.status >= 400 || !page.body) continue;
    visited++;

    const provenance: Provenance = {
      source: parish.jurisdictionId,
      url: page.finalUrl,
      method: "heuristic",
      fetchedAt: new Date().toISOString(),
      confidence: 0.85,
    };

    for (const found of extractSocials(page.body, page.finalUrl)) {
      socials.push({ ...found, lastCheckedAt: provenance.fetchedAt, provenance });
    }
    feeds.push(...extractFeeds(page.body, page.finalUrl));

    // A page that mentions a calendar but exposes no feed still gets recorded,
    // so the events step knows where to point its HTML/LLM reader.
    if (/\b(calendar|upcoming events|events)\b/i.test(cheerio.load(page.body)("title").text() + path)) {
      feeds.push({ type: "html", url: page.finalUrl });
    }

    if (opts.llm && llmAvailable() && !serviceTimes.length && /liturg|service|schedule|mass/i.test(path)) {
      const rows = await extractServiceTimes(htmlToText(page.body, page.finalUrl, 20_000), parish.name);
      serviceTimes = rows
        .filter((r) => r.label)
        .map((r) => ({
          label: r.label,
          dayOfWeek: typeof r.dayOfWeek === "number" ? r.dayOfWeek : undefined,
          time: /^\d{2}:\d{2}$/.test(r.time ?? "") ? r.time : undefined,
          language: r.language,
          note: r.note,
        }));
    }
  }

  const dedupedSocials = uniqueBy(socials, (s) => `${s.platform}:${(s.handle ?? s.url).toLowerCase()}`);
  const flags = parish.flags.filter((f) => f !== "no-socials" && f !== "site-unreachable");
  if (!visited) flags.push("site-unreachable");
  else if (!dedupedSocials.length) flags.push("no-socials");

  return {
    ...parish,
    socials: dedupedSocials,
    feeds: uniqueBy(feeds, (f) => f.url),
    serviceTimes,
    lastSeenAt: new Date().toISOString(),
    flags: [...new Set(flags)],
  };
}
