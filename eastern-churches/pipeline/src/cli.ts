#!/usr/bin/env -S npx tsx
import { harvest } from "./steps/harvest.js";
import { enrich } from "./steps/enrich.js";
import { geocode } from "./steps/geocode.js";
import { collectEvents, type EventSource } from "./steps/events.js";
import { syncOsm } from "./steps/osm.js";
import { buildDataset } from "./steps/build.js";
import { report } from "./steps/report.js";
import { loadRegistry, harvestTargets } from "./registry.js";
import { log } from "./util/log.js";

interface Flags {
  [key: string]: string | boolean;
}

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const [command = "help", ...rest] = argv;
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > -1) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    else if (rest[i + 1] && !rest[i + 1]!.startsWith("--")) flags[arg.slice(2)] = rest[++i]!;
    else flags[arg.slice(2)] = true;
  }
  return { command, flags };
}

const str = (f: Flags, k: string) => (typeof f[k] === "string" ? (f[k] as string) : undefined);
const num = (f: Flags, k: string) => (typeof f[k] === "string" ? Number(f[k]) : undefined);
const bool = (f: Flags, k: string) => f[k] === true || f[k] === "true";

const HELP = `
eastern-churches pipeline

  harvest    Read each jurisdiction's parish directory into data/parishes.json
    --tradition=<id>      Limit to one tradition (see \`targets\`)
    --jurisdiction=<id>   Limit to one jurisdiction
    --llm                 Use the model on pages with no structured data
    --fresh               Ignore the on-disk fetch cache
    --dry-run             Print candidates, write nothing

  enrich     Visit parish websites for socials, calendar feeds, service times
    --tradition / --jurisdiction / --llm / --fresh
    --missing-only        Only parishes with no socials recorded yet
    --limit=<n>

  geocode    Fill coordinates via the US Census geocoder, Nominatim fallback
    --limit=<n>

  osm        Cross-check against OpenStreetMap; fills coords, finds strays
    --tradition=<id> --dry-run

  events     Collect events from the sources you name
    --sources=ical,jsonld,rss,html,meta,submissions   (default: all but html/meta)
    --horizon=<days>      Default 180
    --tradition / --jurisdiction / --fresh / --limit

  build      Emit web/data/dataset.json for the web app
    --include-unplaced    Ship parishes with no state and no coordinates

  refresh    harvest -> enrich -> geocode -> events -> build, with defaults
  report     Print per-tradition coverage and everything flagged for review
  targets    List the jurisdictions the registry will crawl
`;

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "harvest":
      await harvest({
        tradition: str(flags, "tradition"),
        jurisdiction: str(flags, "jurisdiction"),
        llm: bool(flags, "llm"),
        fresh: bool(flags, "fresh"),
        dryRun: bool(flags, "dry-run"),
      });
      break;

    case "enrich":
      await enrich({
        tradition: str(flags, "tradition"),
        jurisdiction: str(flags, "jurisdiction"),
        missingOnly: bool(flags, "missing-only"),
        llm: bool(flags, "llm"),
        fresh: bool(flags, "fresh"),
        limit: num(flags, "limit"),
      });
      break;

    case "geocode":
      await geocode({ fresh: bool(flags, "fresh"), limit: num(flags, "limit") });
      break;

    case "osm":
      await syncOsm({ tradition: str(flags, "tradition"), dryRun: bool(flags, "dry-run") });
      break;

    case "events":
      await collectEvents({
        sources: str(flags, "sources")?.split(",").map((s) => s.trim()) as EventSource[] | undefined,
        tradition: str(flags, "tradition"),
        jurisdiction: str(flags, "jurisdiction"),
        horizonDays: num(flags, "horizon"),
        fresh: bool(flags, "fresh"),
        limit: num(flags, "limit"),
      });
      break;

    case "build":
      buildDataset({ includeUnplaced: bool(flags, "include-unplaced") });
      break;

    case "refresh": {
      const llm = bool(flags, "llm");
      await harvest({ llm, fresh: bool(flags, "fresh") });
      await enrich({ llm });
      await geocode({});
      await collectEvents({ sources: llm ? ["ical", "jsonld", "rss", "html", "submissions"] : undefined });
      buildDataset({});
      report();
      break;
    }

    case "report":
      report();
      break;

    case "targets": {
      const registry = loadRegistry();
      console.log(`${registry.traditions.length} traditions, ${registry.jurisdictions.length} jurisdictions\n`);
      for (const t of harvestTargets()) {
        console.log(
          `${t.tradition.padEnd(16)} ${t.confidence.padEnd(9)} ${t.label}\n${" ".repeat(28)}${t.urls.join("\n" + " ".repeat(28))}`,
        );
      }
      break;
    }

    default:
      console.log(HELP);
  }
}

main().catch((err) => {
  log.error("pipeline failed", err);
  process.exitCode = 1;
});
