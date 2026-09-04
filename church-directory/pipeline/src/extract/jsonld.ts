import * as cheerio from "cheerio";

/** Every JSON-LD object on the page, flattened out of @graph wrappers. */
export function readJsonLd(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html);
  const out: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      for (const node of flatten(parsed)) out.push(node);
    } catch {
      // Hand-written JSON-LD is frequently malformed; skip rather than throw.
    }
  });
  return out;
}

function flatten(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  const nested = Array.isArray(obj["@graph"]) ? (obj["@graph"] as unknown[]).flatMap(flatten) : [];
  return [obj, ...nested];
}

export function typeOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

export function isType(node: Record<string, unknown>, ...names: string[]): boolean {
  const types = typeOf(node).map((t) => t.split("/").pop()!.toLowerCase());
  return names.some((n) => types.includes(n.toLowerCase()));
}

export function str(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) return str(value[0]);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return str(o["name"] ?? o["@value"] ?? o["url"]);
  }
  return undefined;
}
