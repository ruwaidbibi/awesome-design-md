import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./config.js";
import { Parish, ChurchEvent, type Parish as ParishT, type ChurchEvent as EventT } from "./schema.js";
import { log } from "./util/log.js";

const PARISHES = join(DATA_DIR, "parishes.json");
const EVENTS = join(DATA_DIR, "events.json");
const HEALTH = join(DATA_DIR, "registry-health.json");
const SUBMISSIONS = join(DATA_DIR, "submissions.json");

function readArray<T>(path: string, parse: (v: unknown) => T): T[] {
  if (!existsSync(path)) return [];
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    try {
      out.push(parse(item));
    } catch (err) {
      log.warn(`dropping invalid record in ${path}`, (err as Error).message);
    }
  }
  return out;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export const store = {
  readParishes: (): ParishT[] => readArray(PARISHES, (v) => Parish.parse(v)),
  writeParishes: (parishes: ParishT[]) => {
    const sorted = [...parishes].sort((a, b) => a.id.localeCompare(b.id));
    writeJson(PARISHES, sorted);
    log.info(`wrote ${sorted.length} parishes to data/parishes.json`);
  },

  readEvents: (): EventT[] => readArray(EVENTS, (v) => ChurchEvent.parse(v)),
  writeEvents: (events: EventT[]) => {
    const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
    writeJson(EVENTS, sorted);
    log.info(`wrote ${sorted.length} events to data/events.json`);
  },

  readSubmissions: (): unknown[] =>
    existsSync(SUBMISSIONS) ? (JSON.parse(readFileSync(SUBMISSIONS, "utf8")) as unknown[]) : [],

  writeHealth: (health: unknown) => writeJson(HEALTH, health),
  readHealth: (): Record<string, unknown> =>
    existsSync(HEALTH) ? (JSON.parse(readFileSync(HEALTH, "utf8")) as Record<string, unknown>) : {},
};
