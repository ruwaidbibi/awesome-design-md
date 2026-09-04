/**
 * Parish ids must survive a site redesign, so they are built from the things
 * least likely to change: tradition, state, and a normalised name. Two records
 * that slugify identically are the same parish as far as the pipeline is
 * concerned, which is also the first pass of deduplication.
 */
const NOISE = [
  "saint", "st", "holy", "our", "lady", "of", "the", "church", "cathedral",
  "parish", "mission", "orthodox", "catholic", "coptic", "greek", "syriac",
  "maronite", "chaldean", "melkite", "assyrian", "antiochian", "american",
];

export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The name with denominational boilerplate removed, for fuzzy matching. */
export function nameKey(name: string): string {
  const words = normalizeName(name).split(" ").filter((w) => w && !NOISE.includes(w));
  return (words.length ? words : normalizeName(name).split(" ")).join("-");
}

export function parishId(tradition: string, name: string, state?: string, city?: string): string {
  const parts = [tradition, state?.toLowerCase(), nameKey(name)];
  const base = parts.filter(Boolean).join("-");
  // City only enters the id when the name alone is generic enough to collide
  // (St. Mary appears dozens of times per tradition per state).
  return city ? `${base}-${nameKey(city)}` : base;
}

export function eventId(parishId: string, title: string, start: string): string {
  return `${parishId}--${nameKey(title).slice(0, 40)}--${start.slice(0, 16).replace(/[:T]/g, "")}`;
}
