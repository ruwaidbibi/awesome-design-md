import { store } from "../store.js";
import { loadRegistry } from "../registry.js";

/** Prints where the dataset actually stands, per tradition. */
export function report(): void {
  const registry = loadRegistry();
  const parishes = store.readParishes();
  const events = store.readEvents();
  const health = store.readHealth();

  const rows = registry.traditions.map((t) => {
    const mine = parishes.filter((p) => p.tradition === t.id);
    const withEvents = new Set(events.filter((e) => mine.some((p) => p.id === e.parishId)).map((e) => e.parishId));
    return {
      tradition: t.name,
      found: mine.length,
      estimated: t.estimatedUsParishes,
      coverage: t.estimatedUsParishes ? `${Math.round((mine.length / t.estimatedUsParishes) * 100)}%` : "-",
      mapped: mine.filter((p) => p.coordinates).length,
      withSite: mine.filter((p) => p.website).length,
      withSocial: mine.filter((p) => p.socials.length).length,
      withEvents: withEvents.size,
    };
  });

  console.table(rows);

  const totals = {
    parishes: parishes.length,
    events: events.length,
    socialAccounts: parishes.reduce((n, p) => n + p.socials.length, 0),
    flagged: parishes.filter((p) => p.flags.length).length,
  };
  console.log("\nTotals:", totals);

  const flagged = Object.entries(health).filter(
    ([, v]) => Array.isArray((v as { flags?: string[] })?.flags) && (v as { flags: string[] }).flags.length,
  );
  if (flagged.length) {
    console.log("\nJurisdictions needing attention:");
    for (const [id, v] of flagged) {
      const h = v as { label?: string; found?: number; flags?: string[]; urls?: string[] };
      console.log(`  ${id}: found ${h.found} [${h.flags?.join(", ")}] ${h.urls?.[0] ?? ""}`);
    }
  }

  const topFlags = new Map<string, number>();
  for (const p of parishes) for (const f of p.flags) topFlags.set(f, (topFlags.get(f) ?? 0) + 1);
  if (topFlags.size) {
    console.log("\nParish flags:");
    for (const [flag, n] of [...topFlags].sort((a, b) => b[1] - a[1])) console.log(`  ${flag}: ${n}`);
  }
}
