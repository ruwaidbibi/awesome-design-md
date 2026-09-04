import { fetchUrl } from "../net/fetcher.js";
import { store } from "../store.js";
import { parishId } from "../util/slug.js";
import { sameParish, mergeParish } from "../util/dedupe.js";
import { normalizeState, normalizePhone } from "../extract/address.js";
import { log } from "../util/log.js";
import type { Parish, Provenance, TraditionId } from "../schema.js";

/**
 * OpenStreetMap is a cross-check, not a primary source. It contributes two
 * things the official directories do not: coordinates for parishes whose
 * address failed to geocode, and parishes that exist on the ground but never
 * made it onto their eparchy's website. Its weakness is the reverse: the
 * `denomination` tag is inconsistently applied, so it under-reports badly and
 * is never used alone to establish that a parish exists in a tradition.
 */
const DENOMINATION_TAGS: Record<TraditionId, string[]> = {
  maronite: ["maronite"],
  chaldean: ["chaldean_catholic", "chaldean"],
  melkite: ["melkite", "greek_catholic"],
  "greek-orthodox": ["greek_orthodox"],
  "coptic-orthodox": ["coptic_orthodox", "copt"],
  "syriac-orthodox": ["syriac_orthodox", "syrian_orthodox", "jacobite"],
  "assyrian-coe": ["assyrian_church_of_the_east", "assyrian", "nestorian"],
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export async function syncOsm(opts: { tradition?: string; dryRun?: boolean } = {}): Promise<void> {
  const traditions = (Object.keys(DENOMINATION_TAGS) as TraditionId[]).filter(
    (t) => !opts.tradition || t === opts.tradition,
  );

  const parishes = store.readParishes();
  const result = [...parishes];
  let matched = 0;
  let added = 0;

  for (const tradition of traditions) {
    const elements = await queryOverpass(tradition);
    log.info(`osm ${tradition}: ${elements.length} elements`);

    for (const el of elements) {
      const tags = el.tags ?? {};
      const name = tags["name"] ?? tags["name:en"];
      if (!name) continue;

      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat === undefined || lon === undefined) continue;

      const provenance: Provenance = {
        source: "openstreetmap",
        url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        method: "api",
        fetchedAt: new Date().toISOString(),
        confidence: 0.7,
      };

      const incoming: Partial<Parish> = {
        name,
        tradition,
        coordinates: { lat, lon, precision: "rooftop", source: "openstreetmap" },
        address: {
          street: [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || undefined,
          city: tags["addr:city"],
          state: normalizeState(tags["addr:state"]),
          postalCode: tags["addr:postcode"],
          country: "US",
        },
        phone: normalizePhone(tags["phone"] ?? tags["contact:phone"]),
        website: tags["website"] ?? tags["contact:website"],
        provenance: [provenance],
      };

      const match = result.find((p) => p.tradition === tradition && sameParish(p, incoming));
      if (match) {
        // Coordinates are OSM's strong suit, so let them win when we have none.
        const conf = match.coordinates ? 0.4 : 0.9;
        result[result.indexOf(match)] = mergeParish(match, incoming, conf);
        matched++;
        continue;
      }

      const id = `${parishId(tradition, name, incoming.address?.state, incoming.address?.city)}-osm`;
      if (result.some((p) => p.id === id)) continue;

      const now = new Date().toISOString();
      result.push({
        id,
        name,
        alternateNames: tags["name:ar"] || tags["name:syc"] ? [tags["name:ar"], tags["name:syc"]].filter(Boolean) as string[] : [],
        tradition,
        // Not attributable to an eparchy without a human look.
        jurisdictionId: "unassigned",
        status: "unknown",
        address: incoming.address,
        coordinates: incoming.coordinates,
        phone: incoming.phone,
        website: incoming.website,
        clergy: [],
        languages: [],
        serviceTimes: [],
        socials: [],
        feeds: [],
        provenance: [provenance],
        mergedFrom: [],
        firstSeenAt: now,
        lastSeenAt: now,
        flags: ["osm-only", "needs-jurisdiction"],
      });
      added++;
    }
  }

  log.info(`osm: ${matched} matched to existing parishes, ${added} new (flagged osm-only)`);
  if (!opts.dryRun) store.writeParishes(result);
}

async function queryOverpass(tradition: TraditionId): Promise<OverpassElement[]> {
  const pattern = DENOMINATION_TAGS[tradition].join("|");
  const query = `[out:json][timeout:180];
area["ISO3166-1"="US"][admin_level=2]->.us;
nwr["amenity"="place_of_worship"]["denomination"~"^(${pattern})$",i](area.us);
out center tags;`;

  for (const endpoint of ENDPOINTS) {
    const res = await fetchUrl(`${endpoint}?data=${encodeURIComponent(query)}`, {
      ignoreRobots: true,
      timeoutMs: 200_000,
      retries: 1,
    });
    if (!res?.body) continue;
    try {
      return (JSON.parse(res.body) as { elements?: OverpassElement[] }).elements ?? [];
    } catch {
      log.warn(`overpass returned non-JSON from ${endpoint}`);
    }
  }
  log.warn(`overpass unreachable for ${tradition}`);
  return [];
}
