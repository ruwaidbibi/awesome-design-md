import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Dataset, type Dataset as DatasetT } from "../schema.js";
import { store } from "../store.js";
import { loadRegistry } from "../registry.js";
import { REPO } from "../config.js";
import { log } from "../util/log.js";

/**
 * Publishes the dataset the web app imports. Parishes with no usable identity
 * (no state and no coordinates) are held back rather than shipped, because a
 * record that cannot be placed on the map or filtered by state is worse than
 * absent: it inflates the counts and makes the directory look wrong.
 */
export function buildDataset(opts: { includeUnplaced?: boolean } = {}): void {
  const allParishes = store.readParishes();
  const events = store.readEvents();

  const parishes = opts.includeUnplaced
    ? allParishes
    : allParishes.filter((p) => p.address?.state || p.coordinates);

  const held = allParishes.length - parishes.length;
  if (held) log.warn(`${held} parishes held back (no state and no coordinates); pass --include-unplaced to ship them`);

  const parishIds = new Set(parishes.map((p) => p.id));
  const liveEvents = events.filter((e) => parishIds.has(e.parishId) && !e.cancelled);

  const dataset: DatasetT = Dataset.parse({
    generatedAt: new Date().toISOString(),
    version: "0.1.0",
    counts: {
      parishes: parishes.length,
      events: liveEvents.length,
      socials: parishes.reduce((n, p) => n + p.socials.length, 0),
      withCoordinates: parishes.filter((p) => p.coordinates).length,
    },
    parishes,
    events: liveEvents,
  });

  const outDir = join(REPO, "web", "data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "dataset.json"), `${JSON.stringify(dataset)}\n`);

  // The registry travels with the dataset so the UI can name traditions and
  // link back to each jurisdiction without a second import path.
  writeFileSync(join(outDir, "registry.json"), `${JSON.stringify(loadRegistry())}\n`);

  log.info(
    `built web/data/dataset.json: ${dataset.counts.parishes} parishes, ` +
      `${dataset.counts.events} events, ${dataset.counts.socials} socials, ` +
      `${dataset.counts.withCoordinates} mapped`,
  );
}
