import pLimit from "p-limit";
import { fetchJson } from "../net/fetcher.js";
import { store } from "../store.js";
import { config } from "../config.js";
import { log } from "../util/log.js";
import type { Coordinates, Parish } from "../schema.js";

/**
 * Census first: it is free, keyless, US-only, rooftop-accurate, and has no
 * rate limit worth worrying about. Nominatim is the fallback for addresses the
 * Census matcher rejects, and its usage policy caps us at one request per
 * second and requires a real contact address in the User-Agent.
 */
export async function geocode(opts: { fresh?: boolean; limit?: number } = {}): Promise<void> {
  const parishes = store.readParishes();
  let queue = parishes.filter((p) => !p.coordinates && p.address?.state);
  if (opts.limit) queue = queue.slice(0, opts.limit);

  if (!queue.length) {
    log.info("nothing to geocode");
    return;
  }
  if (!config.geocoderContact) {
    log.warn("GEOCODER_CONTACT is unset; the Nominatim fallback will be skipped");
  }
  log.info(`geocoding ${queue.length} parishes`);

  const byId = new Map(parishes.map((p) => [p.id, p]));
  const limit = pLimit(2);
  let hits = 0;

  await Promise.all(
    queue.map((parish) =>
      limit(async () => {
        const coords = (await viaCensus(parish)) ?? (await viaNominatim(parish));
        if (coords) {
          byId.set(parish.id, { ...parish, coordinates: coords });
          hits++;
        } else {
          byId.set(parish.id, { ...parish, flags: [...new Set([...parish.flags, "ungeocoded"])] });
        }
      }),
    ),
  );

  log.info(`geocoded ${hits}/${queue.length}`);
  store.writeParishes([...byId.values()]);
}

function addressLine(p: Parish): string | null {
  const a = p.address;
  if (!a?.state) return null;
  const line = [a.street, a.city, a.state, a.postalCode].filter(Boolean).join(", ");
  return line.length > 6 ? line : null;
}

interface CensusResponse {
  result?: { addressMatches?: { coordinates?: { x: number; y: number }; tigerLine?: { side?: string } }[] };
}

async function viaCensus(parish: Parish): Promise<Coordinates | null> {
  const line = addressLine(parish);
  if (!line || !parish.address?.street) return null;

  const url =
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress" +
    `?address=${encodeURIComponent(line)}&benchmark=Public_AR_Current&format=json`;

  const data = await fetchJson<CensusResponse>(url, { ignoreRobots: true });
  const match = data?.result?.addressMatches?.[0];
  if (!match?.coordinates) return null;

  return { lat: match.coordinates.y, lon: match.coordinates.x, precision: "interpolated", source: "census" };
}

interface NominatimResult {
  lat: string;
  lon: string;
  class?: string;
  type?: string;
}

async function viaNominatim(parish: Parish): Promise<Coordinates | null> {
  if (!config.geocoderContact) return null;
  const line = addressLine(parish);
  if (!line) return null;

  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?q=${encodeURIComponent(`${parish.name}, ${line}`)}&countrycodes=us&format=jsonv2&limit=1`;

  const data = await fetchJson<NominatimResult[]>(url, { ignoreRobots: true });
  const hit = data?.[0];
  if (!hit) return null;

  return {
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    precision: hit.class === "amenity" ? "rooftop" : "centroid",
    source: "nominatim",
  };
}
