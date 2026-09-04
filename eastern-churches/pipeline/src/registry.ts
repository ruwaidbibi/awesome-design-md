import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DATA_DIR } from "./config.js";
import { TraditionId } from "./schema.js";

const Expected = z.object({
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  reported: z.number().int().optional(),
});

const Child = z.object({
  id: z.string(),
  name: z.string(),
  directoryUrls: z.array(z.string().url()),
  confidence: z.enum(["verified", "reported", "pattern"]),
  expectedParishes: Expected.optional(),
});

const Jurisdiction = z.object({
  id: z.string(),
  tradition: TraditionId,
  name: z.string(),
  seat: z.string().optional(),
  territory: z.string().optional(),
  site: z.string().url(),
  directoryUrls: z.array(z.string().url()),
  confidence: z.enum(["verified", "reported", "pattern"]),
  note: z.string().optional(),
  expectedParishes: Expected.optional(),
  enabled: z.boolean().default(true),
  children: z.array(Child).default([]),
});
export type Jurisdiction = z.infer<typeof Jurisdiction>;

const Tradition = z.object({
  id: TraditionId,
  name: z.string(),
  family: z.string(),
  rite: z.string(),
  liturgicalLanguages: z.array(z.string()),
  communion: z.string(),
  estimatedUsParishes: z.number().int(),
});
export type Tradition = z.infer<typeof Tradition>;

const Registry = z.object({
  note: z.string().optional(),
  generated: z.string().optional(),
  traditions: z.array(Tradition),
  jurisdictions: z.array(Jurisdiction),
  crossReferenceSources: z.array(z.record(z.unknown())).default([]),
});
export type Registry = z.infer<typeof Registry>;

let cached: Registry | null = null;

export function loadRegistry(): Registry {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(join(DATA_DIR, "jurisdictions.json"), "utf8"));
  cached = Registry.parse(raw);
  return cached;
}

/** Flattens metropolises into standalone crawl targets. */
export interface HarvestTarget {
  jurisdictionId: string;
  subJurisdiction?: string;
  tradition: TraditionId;
  label: string;
  urls: string[];
  confidence: "verified" | "reported" | "pattern";
  expected?: z.infer<typeof Expected>;
}

export function harvestTargets(filter?: { tradition?: string; jurisdiction?: string }): HarvestTarget[] {
  const out: HarvestTarget[] = [];
  for (const j of loadRegistry().jurisdictions) {
    if (!j.enabled) continue;
    if (filter?.tradition && j.tradition !== filter.tradition) continue;
    if (filter?.jurisdiction && j.id !== filter.jurisdiction) continue;

    if (j.children.length) {
      for (const c of j.children) {
        out.push({
          jurisdictionId: j.id,
          subJurisdiction: c.name,
          tradition: j.tradition,
          label: `${j.name} / ${c.name}`,
          urls: c.directoryUrls,
          confidence: c.confidence,
          expected: c.expectedParishes,
        });
      }
    }
    out.push({
      jurisdictionId: j.id,
      tradition: j.tradition,
      label: j.name,
      urls: j.directoryUrls,
      confidence: j.confidence,
      expected: j.expectedParishes,
    });
  }
  return out;
}

export function traditionById(id: string): Tradition | undefined {
  return loadRegistry().traditions.find((t) => t.id === id);
}

export function jurisdictionById(id: string): Jurisdiction | undefined {
  return loadRegistry().jurisdictions.find((j) => j.id === id);
}
