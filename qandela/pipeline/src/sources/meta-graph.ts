import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchJson } from "../net/fetcher.js";
import { config, REPO } from "../config.js";
import { categorize } from "../extract/categorize.js";
import { eventId } from "../util/slug.js";
import { log } from "../util/log.js";
import type { ChurchEvent, Parish, Provenance } from "../schema.js";

/**
 * Facebook and Instagram are where most parish events actually live, and the
 * only lawful way to read them at scale is the Meta Graph API with a Page
 * access token that the Page's own admin has granted to your app.
 *
 * That means, concretely:
 *   1. You create a Meta app and take it through App Review for
 *      `pages_read_engagement` (and `pages_show_list` for the picker).
 *   2. Each parish signs in and grants your app access to their Page.
 *   3. You store the resulting long-lived Page tokens in the file named by
 *      META_PAGE_TOKENS_FILE, keyed by parish id.
 *
 * Parishes that have not granted a token are skipped. There is no scraping
 * fallback here on purpose: reading Facebook without that grant violates
 * Meta's terms, and a directory built on it would break the first time they
 * changed their markup anyway.
 *
 * Note on the API surface: Meta deprecated the public Events edge for most
 * apps years ago, so this reads the Page's own events with the Page's own
 * token. Verify the current edge and version against Meta's changelog before
 * a production run; the version is pinned below so an upstream change fails
 * loudly rather than silently returning nothing.
 */

const GRAPH_VERSION = "v21.0";

interface PageTokenFile {
  /** parishId -> { pageId, accessToken } */
  [parishId: string]: { pageId: string; accessToken: string };
}

let tokens: PageTokenFile | null = null;

function loadTokens(): PageTokenFile {
  if (tokens) return tokens;
  const path = resolve(REPO, config.meta.pageTokensFile);
  if (!existsSync(path)) {
    tokens = {};
    return tokens;
  }
  try {
    tokens = JSON.parse(readFileSync(path, "utf8")) as PageTokenFile;
  } catch (err) {
    log.error(`could not read ${path}`, (err as Error).message);
    tokens = {};
  }
  return tokens;
}

interface GraphEvent {
  id: string;
  name: string;
  description?: string;
  start_time: string;
  end_time?: string;
  place?: { name?: string };
  cover?: { source?: string };
  is_canceled?: boolean;
}

export async function fetchMetaEvents(parish: Parish): Promise<ChurchEvent[]> {
  const grant = loadTokens()[parish.id];
  if (!grant) return [];

  const fields = "id,name,description,start_time,end_time,place,cover,is_canceled";
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${grant.pageId}/events` +
    `?fields=${fields}&limit=50&access_token=${encodeURIComponent(grant.accessToken)}`;

  const res = await fetchJson<{ data?: GraphEvent[]; error?: { message: string } }>(url, {
    ignoreRobots: true,
    fresh: true, // tokens are secrets; never persist these responses to cache
  });

  if (res?.error) {
    log.warn(`Meta Graph error for ${parish.id}: ${res.error.message}`);
    return [];
  }

  const provenance: Provenance = {
    source: "meta-graph",
    url: `https://facebook.com/${grant.pageId}`,
    method: "api",
    fetchedAt: new Date().toISOString(),
    confidence: 0.9,
  };

  return (res?.data ?? []).map((ev) => ({
    id: eventId(parish.id, ev.name, ev.start_time),
    parishId: parish.id,
    title: ev.name,
    description: ev.description?.slice(0, 2000),
    start: ev.start_time,
    end: ev.end_time,
    allDay: false,
    location: ev.place?.name,
    url: `https://www.facebook.com/events/${ev.id}`,
    imageUrl: ev.cover?.source,
    category: categorize(ev.name, ev.description),
    provenance,
    cancelled: Boolean(ev.is_canceled),
  }));
}

export function metaConfigured(): boolean {
  return Object.keys(loadTokens()).length > 0;
}
