import pLimit from "p-limit";
import * as cheerio from "cheerio";
import { fetchUrl } from "../net/fetcher.js";
import { readJsonLd, isType, str } from "../extract/jsonld.js";
import { htmlToText } from "../extract/html-to-text.js";
import { extractParishes, llmAvailable, type LlmParish } from "../extract/llm.js";
import { parseUsAddress, normalizePhone, normalizeState } from "../extract/address.js";
import { harvestTargets, type HarvestTarget } from "../registry.js";
import { store } from "../store.js";
import { parishId } from "../util/slug.js";
import { sameParish, mergeParish } from "../util/dedupe.js";
import { log } from "../util/log.js";
import { config } from "../config.js";
import type { Parish, ParishCandidate, Provenance } from "../schema.js";

export interface HarvestOptions {
  tradition?: string;
  jurisdiction?: string;
  /** Allow the LLM fallback for pages with no structured data. */
  llm?: boolean;
  /** Re-fetch instead of reading the on-disk cache. */
  fresh?: boolean;
  dryRun?: boolean;
}

/**
 * The extraction ladder, in order of trust:
 *
 *   1. JSON-LD Church/Place/Organization  -> confidence 0.95
 *   2. Address-shaped text in list markup -> confidence 0.6
 *   3. The model reading the page text    -> confidence 0.5
 *
 * The pipeline does not ship per-site CSS selectors. Twenty-odd jurisdictions
 * run twenty-odd content management systems, and hand-tuned selectors break on
 * the first redesign. Rungs 1 and 2 cover the sites that publish structured or
 * semi-structured markup; rung 3 covers everything else without needing to
 * know anything about the page in advance.
 */
export async function harvest(opts: HarvestOptions = {}): Promise<void> {
  const targets = harvestTargets({ tradition: opts.tradition, jurisdiction: opts.jurisdiction });
  if (!targets.length) {
    log.error("no harvest targets matched the given filters");
    return;
  }
  if (opts.llm && !llmAvailable()) {
    log.warn("--llm requested but ANTHROPIC_API_KEY is unset; running structured-only");
  }

  const limit = pLimit(config.concurrency);
  const health: Record<string, unknown> = { ...store.readHealth(), checkedAt: new Date().toISOString() };
  const allCandidates: ParishCandidate[] = [];

  await Promise.all(
    targets.map((target) =>
      limit(async () => {
        const found = await harvestTarget(target, opts);
        allCandidates.push(...found);

        const expected = target.expected;
        const flags: string[] = [];
        if (!found.length) flags.push("no-parishes-found");
        if (expected?.min !== undefined && found.length < expected.min) flags.push("under-expected");
        if (expected?.max !== undefined && found.length > expected.max) flags.push("over-expected");

        health[target.subJurisdiction ? `${target.jurisdictionId}/${target.subJurisdiction}` : target.jurisdictionId] = {
          label: target.label,
          urls: target.urls,
          registryConfidence: target.confidence,
          found: found.length,
          expected,
          flags,
        };
        const verdict = flags.length ? `FLAGGED (${flags.join(", ")})` : "ok";
        log.info(`${target.label}: ${found.length} candidates ${verdict}`);
      }),
    ),
  );

  store.writeHealth(health);

  if (opts.dryRun) {
    log.info(`dry run: ${allCandidates.length} candidates, nothing written`);
    console.log(JSON.stringify(allCandidates.slice(0, 25), null, 2));
    return;
  }

  const merged = upsert(store.readParishes(), allCandidates);
  store.writeParishes(merged);
}

async function harvestTarget(target: HarvestTarget, opts: HarvestOptions): Promise<ParishCandidate[]> {
  const out: ParishCandidate[] = [];

  for (const url of target.urls) {
    const page = await fetchUrl(url, { fresh: opts.fresh });
    if (!page || page.status >= 400 || !page.body) {
      log.warn(`${target.label}: ${url} returned ${page?.status ?? "no response"}`);
      continue;
    }

    const structured = fromJsonLd(page.body, target, page.finalUrl);
    if (structured.length) {
      out.push(...structured);
      continue;
    }

    const heuristic = fromListMarkup(page.body, target, page.finalUrl);
    if (heuristic.length >= 3) {
      out.push(...heuristic);
      continue;
    }

    if (opts.llm && llmAvailable()) {
      const text = htmlToText(page.body, page.finalUrl);
      const rows = await extractParishes(text, target.label);
      out.push(...rows.map((row) => fromLlm(row, target, page.finalUrl)));
    } else if (heuristic.length) {
      out.push(...heuristic);
    }
  }

  return dedupeCandidates(out);
}

function fromJsonLd(html: string, target: HarvestTarget, sourceUrl: string): ParishCandidate[] {
  const nodes = readJsonLd(html).filter((n) =>
    isType(n, "Church", "PlaceOfWorship", "Organization", "LocalBusiness", "Place"),
  );

  const out: ParishCandidate[] = [];
  for (const node of nodes) {
    const name = str(node["name"]);
    if (!name || name.length < 3) continue;

    const addr = node["address"] as Record<string, unknown> | undefined;
    const state = normalizeState(str(addr?.["addressRegion"]));
    out.push({
      name,
      jurisdictionId: target.jurisdictionId,
      tradition: target.tradition,
      addressText: str(addr?.["streetAddress"]),
      city: str(addr?.["addressLocality"]),
      state,
      phone: normalizePhone(str(node["telephone"])),
      email: str(node["email"]),
      website: str(node["url"]),
      sourceUrl,
      method: "jsonld",
      confidence: 0.95,
    });
  }
  return out;
}

/**
 * Rung 2: no JSON-LD, but the page repeats a container that holds a name and a
 * US address. Finding "CITY, ST ZIP" inside a block is a strong enough signal
 * that the block is a parish entry, and it works regardless of class names.
 */
function fromListMarkup(html: string, target: HarvestTarget, sourceUrl: string): ParishCandidate[] {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer").remove();
  const out: ParishCandidate[] = [];

  $("li, tr, article, .card, .parish, .church, div").each((_, el) => {
    const $el = $(el);
    // Only look at leaf-ish blocks, so a wrapper does not swallow the whole page.
    if ($el.find("li, tr, article").length > 0) return;

    const text = $el.text().replace(/\s+/g, " ").trim();
    if (text.length < 20 || text.length > 400) return;

    const address = parseUsAddress(text);
    if (!address?.state) return;

    const name =
      $el.find("h1, h2, h3, h4, h5, a strong, strong, b, a").first().text().trim() ||
      text.split(/\d/)[0]?.trim() ||
      "";
    if (name.length < 4 || name.length > 120) return;

    const href = $el.find("a[href^='http']").first().attr("href");
    const phoneMatch = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);

    out.push({
      name,
      jurisdictionId: target.jurisdictionId,
      tradition: target.tradition,
      addressText: address.street,
      city: address.city,
      state: address.state,
      phone: normalizePhone(phoneMatch?.[0]),
      email: emailMatch?.[0],
      website: href && !href.includes(new URL(sourceUrl).host) ? href : undefined,
      sourceUrl,
      method: "heuristic",
      confidence: 0.6,
    });
  });

  return out;
}

function fromLlm(row: LlmParish, target: HarvestTarget, sourceUrl: string): ParishCandidate {
  const parsed = parseUsAddress(row.addressText);
  return {
    name: row.name,
    jurisdictionId: target.jurisdictionId,
    tradition: target.tradition,
    addressText: parsed?.street ?? row.addressText,
    city: row.city ?? parsed?.city,
    state: normalizeState(row.state) ?? parsed?.state,
    phone: normalizePhone(row.phone),
    email: row.email,
    website: row.website,
    sourceUrl,
    method: "llm",
    confidence: 0.5,
  };
}

function dedupeCandidates(candidates: ParishCandidate[]): ParishCandidate[] {
  const kept: ParishCandidate[] = [];
  for (const c of candidates) {
    const dupe = kept.find((k) =>
      sameParish(
        { name: k.name, website: k.website, phone: k.phone, address: { country: "US", city: k.city, state: k.state } },
        { name: c.name, website: c.website, phone: c.phone, address: { country: "US", city: c.city, state: c.state } },
      ),
    );
    if (!dupe) kept.push(c);
    else if (c.confidence > dupe.confidence) kept[kept.indexOf(dupe)] = c;
  }
  return kept;
}

function upsert(existing: Parish[], candidates: ParishCandidate[]): Parish[] {
  const now = new Date().toISOString();
  const result = [...existing];

  for (const c of candidates) {
    const provenance: Provenance = {
      source: c.jurisdictionId,
      url: c.sourceUrl,
      method: c.method,
      fetchedAt: now,
      confidence: c.confidence,
    };

    const address = c.addressText || c.city || c.state
      ? { street: c.addressText, city: c.city, state: c.state, country: "US" as const }
      : undefined;

    const incoming: Partial<Parish> = {
      name: c.name.trim(),
      tradition: c.tradition,
      jurisdictionId: c.jurisdictionId,
      address,
      phone: c.phone,
      email: c.email,
      website: c.website,
      provenance: [provenance],
    };

    const match = result.find((p) => sameParish(p, incoming));
    if (match) {
      result[result.indexOf(match)] = mergeParish(match, incoming, c.confidence);
      continue;
    }

    const id = parishId(c.tradition, c.name, c.state, c.city);
    if (result.some((p) => p.id === id)) {
      // Same slug, different parish (two "St. Mary" in one state). Disambiguate
      // rather than silently collapsing them.
      result.push(newParish(`${id}-${result.filter((p) => p.id.startsWith(id)).length + 1}`, c, incoming, now, ["slug-collision"]));
      continue;
    }
    result.push(newParish(id, c, incoming, now, []));
  }

  return result;
}

function newParish(
  id: string,
  c: ParishCandidate,
  incoming: Partial<Parish>,
  now: string,
  flags: string[],
): Parish {
  return {
    id,
    name: incoming.name!,
    alternateNames: [],
    tradition: c.tradition,
    jurisdictionId: c.jurisdictionId,
    status: "unknown",
    address: incoming.address,
    phone: incoming.phone,
    email: incoming.email,
    website: incoming.website,
    clergy: [],
    languages: [],
    serviceTimes: [],
    socials: [],
    feeds: [],
    provenance: incoming.provenance ?? [],
    mergedFrom: [],
    firstSeenAt: now,
    lastSeenAt: now,
    flags: [...flags, ...(incoming.address?.state ? [] : ["no-state"])],
  };
}
