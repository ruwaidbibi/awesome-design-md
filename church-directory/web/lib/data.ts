import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Dataset, Parish, ChurchEvent, Registry, TraditionId } from "./types";

/**
 * Server-only. The generated dataset is preferred; the synthetic fixture is the
 * fallback so `npm run dev` works on a fresh clone. `isDemo` propagates to the
 * UI, which shows a banner, because a directory quietly displaying invented
 * parishes would be worse than one showing nothing.
 */
const GENERATED = join(process.cwd(), "data", "dataset.json");
const FIXTURE = join(process.cwd(), "..", "data", "fixtures", "sample-dataset.json");
const REGISTRY_GENERATED = join(process.cwd(), "data", "registry.json");
const REGISTRY_SOURCE = join(process.cwd(), "..", "data", "jurisdictions.json");

export interface LoadedData extends Dataset {
  isDemo: boolean;
}

let cache: LoadedData | null = null;

export function getDataset(): LoadedData {
  if (cache) return cache;

  if (existsSync(GENERATED)) {
    cache = { ...(JSON.parse(readFileSync(GENERATED, "utf8")) as Dataset), isDemo: false };
  } else if (existsSync(FIXTURE)) {
    cache = { ...(JSON.parse(readFileSync(FIXTURE, "utf8")) as Dataset), isDemo: true };
  } else {
    cache = {
      generatedAt: new Date().toISOString(),
      version: "0.0.0",
      counts: { parishes: 0, events: 0, socials: 0, withCoordinates: 0 },
      parishes: [],
      events: [],
      isDemo: false,
    };
  }
  return cache;
}

let registryCache: Registry | null = null;

export function getRegistry(): Registry {
  if (registryCache) return registryCache;
  const path = existsSync(REGISTRY_GENERATED) ? REGISTRY_GENERATED : REGISTRY_SOURCE;
  registryCache = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Registry)
    : { traditions: [], jurisdictions: [] };
  return registryCache;
}

export function getParish(id: string): Parish | undefined {
  return getDataset().parishes.find((p) => p.id === id);
}

export function getParishEvents(id: string): ChurchEvent[] {
  return getDataset()
    .events.filter((e) => e.parishId === id)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function getUpcomingEvents(limit?: number): ChurchEvent[] {
  const cutoff = Date.now() - 12 * 36e5;
  const events = getDataset()
    .events.filter((e) => Date.parse(e.start) > cutoff)
    .sort((a, b) => a.start.localeCompare(b.start));
  return limit ? events.slice(0, limit) : events;
}

export interface TraditionSummary {
  id: TraditionId;
  name: string;
  family: string;
  rite: string;
  parishes: number;
  estimated: number;
  events: number;
  socials: number;
}

export function getTraditionSummaries(): TraditionSummary[] {
  const { parishes, events } = getDataset();
  const eventsByParish = new Map<string, number>();
  for (const e of events) eventsByParish.set(e.parishId, (eventsByParish.get(e.parishId) ?? 0) + 1);

  return getRegistry()
    .traditions.map((t) => {
      const mine = parishes.filter((p) => p.tradition === t.id);
      return {
        id: t.id,
        name: t.name,
        family: t.family,
        rite: t.rite,
        parishes: mine.length,
        estimated: t.estimatedUsParishes,
        events: mine.reduce((n, p) => n + (eventsByParish.get(p.id) ?? 0), 0),
        socials: mine.reduce((n, p) => n + p.socials.length, 0),
      };
    })
    .sort((a, b) => b.parishes - a.parishes);
}

/** Parish records trimmed to what the client bundle actually needs. */
export interface ParishSummary {
  id: string;
  name: string;
  tradition: TraditionId;
  status: Parish["status"];
  city?: string;
  state?: string;
  lat?: number;
  lon?: number;
  website?: string;
  socialCount: number;
  platforms: string[];
  eventCount: number;
  nextEvent?: string;
}

export function getParishSummaries(): ParishSummary[] {
  const { parishes, events } = getDataset();
  const byParish = new Map<string, ChurchEvent[]>();
  for (const e of events) {
    const list = byParish.get(e.parishId);
    if (list) list.push(e);
    else byParish.set(e.parishId, [e]);
  }

  return parishes
    .map((p) => {
      const own = (byParish.get(p.id) ?? []).sort((a, b) => a.start.localeCompare(b.start));
      const next = own.find((e) => Date.parse(e.start) > Date.now() - 12 * 36e5);
      return {
        id: p.id,
        name: p.name,
        tradition: p.tradition,
        status: p.status,
        city: p.address?.city,
        state: p.address?.state,
        lat: p.coordinates?.lat,
        lon: p.coordinates?.lon,
        website: p.website,
        socialCount: p.socials.length,
        platforms: p.socials.map((s) => s.platform),
        eventCount: own.length,
        nextEvent: next?.start,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
