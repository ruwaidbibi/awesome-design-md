import pLimit from "p-limit";
import { fetchUrl } from "../net/fetcher.js";
import { parseIcal } from "../extract/ical.js";
import { readJsonLd, isType, str } from "../extract/jsonld.js";
import { htmlToText } from "../extract/html-to-text.js";
import { extractEvents, llmAvailable } from "../extract/llm.js";
import { categorize } from "../extract/categorize.js";
import { store } from "../store.js";
import { eventId } from "../util/slug.js";
import { uniqueBy } from "../util/dedupe.js";
import { log } from "../util/log.js";
import { config } from "../config.js";
import { fetchMetaEvents } from "../sources/meta-graph.js";
import { readSubmittedEvents } from "../sources/submissions.js";
import type { ChurchEvent, Parish, Provenance } from "../schema.js";

export type EventSource = "ical" | "jsonld" | "rss" | "html" | "meta" | "submissions";

export interface EventsOptions {
  sources?: EventSource[];
  jurisdiction?: string;
  tradition?: string;
  horizonDays?: number;
  fresh?: boolean;
  limit?: number;
}

const DEFAULT_SOURCES: EventSource[] = ["ical", "jsonld", "rss", "submissions"];

/**
 * Coverage, honestly stated: iCal and JSON-LD together reach roughly a quarter
 * to a half of parishes, because that is how many publish machine-readable
 * calendars. The `html` source (model-read bulletin and calendar pages) lifts
 * that materially but costs a model call per page per refresh. `meta` reaches
 * the parishes whose events only ever exist on Facebook, but only for pages
 * that have granted your Meta app a token. `submissions` is the backstop for
 * everything else.
 */
export async function collectEvents(opts: EventsOptions = {}): Promise<void> {
  const sources = opts.sources?.length ? opts.sources : DEFAULT_SOURCES;
  const horizonDays = opts.horizonDays ?? 180;

  let parishes = store.readParishes();
  if (opts.jurisdiction) parishes = parishes.filter((p) => p.jurisdictionId === opts.jurisdiction);
  if (opts.tradition) parishes = parishes.filter((p) => p.tradition === opts.tradition);
  if (opts.limit) parishes = parishes.slice(0, opts.limit);

  if (!parishes.length) {
    log.warn("no parishes matched; run `harvest` and `enrich` first");
    return;
  }
  log.info(`collecting events for ${parishes.length} parishes from: ${sources.join(", ")}`);

  const limit = pLimit(config.concurrency);
  const collected: ChurchEvent[] = [];

  await Promise.all(
    parishes.map((parish) =>
      limit(async () => {
        collected.push(...(await eventsForParish(parish, sources, horizonDays, opts.fresh)));
      }),
    ),
  );

  if (sources.includes("submissions")) {
    collected.push(...readSubmittedEvents(new Set(parishes.map((p) => p.id))));
  }

  // Keep events from other jurisdictions that this run did not touch.
  const touched = new Set(parishes.map((p) => p.id));
  const untouched = store.readEvents().filter((e) => !touched.has(e.parishId));

  const merged = uniqueBy([...collected, ...untouched], (e) => e.id)
    .filter((e) => withinHorizon(e, horizonDays));

  const withEvents = new Set(collected.map((e) => e.parishId)).size;
  log.info(`${collected.length} events across ${withEvents}/${parishes.length} parishes (${pct(withEvents, parishes.length)} coverage)`);

  store.writeEvents(merged);
}

function pct(a: number, b: number) {
  return b ? `${Math.round((a / b) * 100)}%` : "0%";
}

function withinHorizon(e: ChurchEvent, days: number) {
  const t = Date.parse(e.start);
  if (Number.isNaN(t)) return false;
  return t > Date.now() - 7 * 864e5 && t < Date.now() + days * 864e5;
}

async function eventsForParish(
  parish: Parish,
  sources: EventSource[],
  horizonDays: number,
  fresh?: boolean,
): Promise<ChurchEvent[]> {
  const out: ChurchEvent[] = [];
  const base = (method: Provenance["method"], url: string, confidence: number): Provenance => ({
    source: parish.jurisdictionId,
    url,
    method,
    fetchedAt: new Date().toISOString(),
    confidence,
  });

  if (sources.includes("ical")) {
    for (const feed of parish.feeds.filter((f) => f.type === "ical")) {
      const res = await fetchUrl(feed.url, { fresh, accept: "text/calendar" });
      if (res?.body) out.push(...parseIcal(res.body, parish.id, base("ical", feed.url, 0.95), horizonDays));
    }
  }

  const htmlish = parish.feeds.filter((f) => f.type === "html" || f.type === "jsonld");
  for (const feed of htmlish) {
    const needsJsonLd = sources.includes("jsonld");
    const needsHtml = sources.includes("html");
    if (!needsJsonLd && !needsHtml) break;

    const res = await fetchUrl(feed.url, { fresh });
    if (!res?.body) continue;

    if (needsJsonLd) {
      const found = fromJsonLdEvents(res.body, parish, base("jsonld", res.finalUrl, 0.9));
      out.push(...found);
      if (found.length) continue;
    }
    if (needsHtml && llmAvailable()) {
      out.push(...(await fromLlmPage(res.body, res.finalUrl, parish, base("llm", res.finalUrl, 0.55))));
    }
  }

  if (sources.includes("rss")) {
    for (const feed of parish.feeds.filter((f) => f.type === "rss")) {
      const res = await fetchUrl(feed.url, { fresh, accept: "application/rss+xml" });
      if (res?.body) out.push(...fromRss(res.body, parish, base("rss", feed.url, 0.7)));
    }
  }

  if (sources.includes("meta")) {
    out.push(...(await fetchMetaEvents(parish)));
  }

  return uniqueBy(out, (e) => e.id);
}

function fromJsonLdEvents(html: string, parish: Parish, provenance: Provenance): ChurchEvent[] {
  const out: ChurchEvent[] = [];
  for (const node of readJsonLd(html)) {
    if (!isType(node, "Event", "SocialEvent", "EducationEvent", "MusicEvent", "Festival")) continue;
    const title = str(node["name"]);
    const start = str(node["startDate"]);
    if (!title || !start) continue;

    const allDay = /^\d{4}-\d{2}-\d{2}$/.test(start);
    out.push({
      id: eventId(parish.id, title, start),
      parishId: parish.id,
      title,
      description: str(node["description"])?.slice(0, 2000),
      start,
      end: str(node["endDate"]),
      allDay,
      location: str(node["location"]),
      url: str(node["url"]),
      imageUrl: str(node["image"]),
      category: categorize(title, str(node["description"])),
      provenance,
      cancelled: /cancel/i.test(str(node["eventStatus"]) ?? ""),
    });
  }
  return out;
}

function fromRss(xml: string, parish: Parish, provenance: Provenance): ChurchEvent[] {
  const out: ChurchEvent[] = [];
  const items = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) ?? [];

  for (const item of items.slice(0, 50)) {
    const title = unescapeXml(pick(item, "title"));
    const dateRaw = pick(item, "pubDate") || pick(item, "published") || pick(item, "updated") || pick(item, "dc:date");
    if (!title || !dateRaw) continue;
    const t = Date.parse(dateRaw);
    if (Number.isNaN(t)) continue;

    // An RSS item is an announcement, not necessarily an event. Only keep the
    // ones whose title reads like one, and mark the confidence accordingly.
    const category = categorize(title);
    if (category === "other") continue;

    const start = new Date(t).toISOString();
    out.push({
      id: eventId(parish.id, title, start),
      parishId: parish.id,
      title,
      description: unescapeXml(pick(item, "description"))?.replace(/<[^>]+>/g, "").slice(0, 1000),
      start,
      allDay: false,
      url: pick(item, "link") || undefined,
      category,
      provenance,
      cancelled: false,
    });
  }
  return out;
}

function pick(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return (m?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function fromLlmPage(
  html: string,
  url: string,
  parish: Parish,
  provenance: Provenance,
): Promise<ChurchEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await extractEvents(htmlToText(html, url, 30_000), parish.name, today);

  const out: ChurchEvent[] = [];
  for (const row of rows) {
    if (!row.title || !row.start) continue;
    const t = Date.parse(row.start);
    if (Number.isNaN(t)) continue;
    const allDay = row.allDay ?? /^\d{4}-\d{2}-\d{2}$/.test(row.start);
    out.push({
      id: eventId(parish.id, row.title, row.start),
      parishId: parish.id,
      title: row.title,
      description: row.description?.slice(0, 2000),
      start: row.start,
      end: row.end,
      allDay,
      location: row.location,
      url: row.url && /^https?:/.test(row.url) ? row.url : url,
      category: categorize(row.title, row.description),
      provenance,
      cancelled: false,
    });
  }
  return out;
}
