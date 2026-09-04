import type { Parish, ParishCandidate } from "../schema.js";
import { nameKey } from "./slug.js";

/**
 * Directories overlap: a metropolis page and the national directory list the
 * same parish, OSM has it under a slightly different name, and a submission
 * corrects the address. Matching is done on the cheapest reliable signals
 * first, because name similarity alone is unusable when a tradition has
 * fourteen parishes called "St. Mary".
 */
export function sameParish(a: Partial<Parish>, b: Partial<Parish>): boolean {
  if (a.website && b.website && hostOf(a.website) === hostOf(b.website)) return true;
  if (a.phone && b.phone && a.phone === b.phone) return true;

  const aKey = a.name ? nameKey(a.name) : "";
  const bKey = b.name ? nameKey(b.name) : "";
  if (!aKey || !bKey) return false;

  const aState = a.address?.state;
  const bState = b.address?.state;
  if (aState && bState && aState !== bState) return false;

  const aCity = a.address?.city?.toLowerCase();
  const bCity = b.address?.city?.toLowerCase();
  if (aKey === bKey && aCity && bCity) return aCity === bCity;
  if (aKey === bKey && aState && bState) return true;

  // Within ~200m two places of worship of the same tradition are the same one.
  if (a.coordinates && b.coordinates && a.tradition === b.tradition) {
    if (haversineMeters(a.coordinates, b.coordinates) < 200) return true;
  }
  return false;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Field-level merge. Higher-confidence provenance wins; equal confidence keeps
 * the incumbent so repeated runs are stable.
 */
export function mergeParish(existing: Parish, incoming: Partial<Parish>, confidence: number): Parish {
  const best = <T>(current: T | undefined, next: T | undefined, currentConf: number): T | undefined =>
    next !== undefined && (current === undefined || confidence > currentConf) ? next : current;

  const incumbentConf = existing.provenance.at(-1)?.confidence ?? 0;

  return {
    ...existing,
    name: existing.name || incoming.name || existing.name,
    alternateNames: unique([
      ...existing.alternateNames,
      ...(incoming.alternateNames ?? []),
      ...(incoming.name && incoming.name !== existing.name ? [incoming.name] : []),
    ]),
    status: existing.status === "unknown" ? incoming.status ?? "unknown" : existing.status,
    address: best(existing.address, incoming.address, incumbentConf),
    coordinates: best(existing.coordinates, incoming.coordinates, incumbentConf),
    phone: existing.phone ?? incoming.phone,
    email: existing.email ?? incoming.email,
    website: existing.website ?? incoming.website,
    subJurisdiction: existing.subJurisdiction ?? incoming.subJurisdiction,
    clergy: existing.clergy.length ? existing.clergy : incoming.clergy ?? [],
    languages: unique([...existing.languages, ...(incoming.languages ?? [])]),
    serviceTimes: existing.serviceTimes.length ? existing.serviceTimes : incoming.serviceTimes ?? [],
    socials: mergeSocials(existing.socials, incoming.socials ?? []),
    feeds: uniqueBy([...existing.feeds, ...(incoming.feeds ?? [])], (f) => f.url),
    provenance: [...existing.provenance, ...(incoming.provenance ?? [])].slice(-20),
    lastSeenAt: new Date().toISOString(),
    flags: unique([...existing.flags, ...(incoming.flags ?? [])]),
  };
}

function mergeSocials(a: Parish["socials"], b: Parish["socials"]): Parish["socials"] {
  return uniqueBy([...a, ...b], (s) => `${s.platform}:${(s.handle ?? s.url).toLowerCase()}`);
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(key(item))) seen.set(key(item), item);
  return [...seen.values()];
}

export function candidateToPartial(c: ParishCandidate): Partial<Parish> {
  return {
    name: c.name.trim(),
    tradition: c.tradition,
    jurisdictionId: c.jurisdictionId,
    phone: c.phone,
    email: c.email,
    website: c.website,
  };
}
