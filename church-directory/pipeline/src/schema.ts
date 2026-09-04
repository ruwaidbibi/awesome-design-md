import { z } from "zod";

/**
 * The data contract for the whole project. Everything the pipeline emits and
 * everything the web app reads is validated against these schemas, so a broken
 * adapter fails at the boundary instead of silently poisoning the dataset.
 */

export const TraditionId = z.enum([
  "maronite",
  "chaldean",
  "melkite",
  "greek-orthodox",
  "coptic-orthodox",
  "syriac-orthodox",
  "assyrian-coe",
]);
export type TraditionId = z.infer<typeof TraditionId>;

/** How a given field came to be. Kept per-field so the UI can be honest. */
export const Provenance = z.object({
  source: z.string(), // jurisdiction id, "openstreetmap", "meta-graph", "submission", ...
  url: z.string().url().optional(),
  method: z.enum(["jsonld", "microdata", "ical", "rss", "heuristic", "llm", "api", "manual"]),
  fetchedAt: z.string().datetime(),
  /** 0-1. Structured sources score high; LLM-read prose scores lower. */
  confidence: z.number().min(0).max(1),
});
export type Provenance = z.infer<typeof Provenance>;

export const SocialPlatform = z.enum([
  "facebook",
  "instagram",
  "youtube",
  "x",
  "tiktok",
  "whatsapp",
  "telegram",
  "linkedin",
  "flickr",
  "soundcloud",
  "spotify",
  "podcast",
]);
export type SocialPlatform = z.infer<typeof SocialPlatform>;

export const SocialAccount = z.object({
  platform: SocialPlatform,
  url: z.string().url(),
  /** Handle without the leading @, when one can be parsed out of the URL. */
  handle: z.string().optional(),
  /** Populated only by the Meta Graph API step, for pages that opted in. */
  followers: z.number().int().nonnegative().optional(),
  verified: z.boolean().optional(),
  lastCheckedAt: z.string().datetime().optional(),
  provenance: Provenance,
});
export type SocialAccount = z.infer<typeof SocialAccount>;

export const Address = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().length(2).optional(),
  postalCode: z.string().optional(),
  country: z.literal("US").default("US"),
  formatted: z.string().optional(),
});
export type Address = z.infer<typeof Address>;

export const Coordinates = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Which geocoder produced this, and how exact it is. */
  precision: z.enum(["rooftop", "interpolated", "centroid", "unknown"]).default("unknown"),
  source: z.enum(["census", "nominatim", "openstreetmap", "directory", "manual"]),
});
export type Coordinates = z.infer<typeof Coordinates>;

/** A recurring service time, e.g. Divine Liturgy Sundays 10:00 in Arabic. */
export const ServiceTime = z.object({
  label: z.string(), // "Divine Liturgy", "Qurbono", "Holy Qurbana", "Orthros"
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  language: z.string().optional(),
  note: z.string().optional(),
});
export type ServiceTime = z.infer<typeof ServiceTime>;

export const Parish = z.object({
  id: z.string(), // stable slug, see util/slug.ts
  name: z.string().min(2),
  /** Names as the community itself writes them, e.g. Arabic or Syriac. */
  alternateNames: z.array(z.string()).default([]),
  tradition: TraditionId,
  jurisdictionId: z.string(),
  /** Metropolis / deanery / vicariate within the jurisdiction, when known. */
  subJurisdiction: z.string().optional(),
  status: z.enum(["parish", "mission", "cathedral", "monastery", "chapel", "unknown"]).default("unknown"),
  address: Address.optional(),
  coordinates: Coordinates.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  clergy: z.array(z.object({ title: z.string().optional(), name: z.string() })).default([]),
  languages: z.array(z.string()).default([]),
  serviceTimes: z.array(ServiceTime).default([]),
  socials: z.array(SocialAccount).default([]),
  /** Feeds discovered on the parish site, reused by the events step. */
  feeds: z.array(z.object({ type: z.enum(["ical", "rss", "jsonld", "html"]), url: z.string().url() })).default([]),
  provenance: z.array(Provenance).default([]),
  /** Set when two records were merged; keeps the losing ids resolvable. */
  mergedFrom: z.array(z.string()).default([]),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  /** Reasons this record needs a human look. Surfaced in the admin view. */
  flags: z.array(z.string()).default([]),
});
export type Parish = z.infer<typeof Parish>;

export const ChurchEvent = z.object({
  id: z.string(),
  parishId: z.string(),
  title: z.string().min(2),
  description: z.string().optional(),
  /** ISO 8601. All-day events carry a date-only start and allDay=true. */
  start: z.string(),
  end: z.string().optional(),
  allDay: z.boolean().default(false),
  timezone: z.string().optional(),
  location: z.string().optional(),
  url: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  /** Coarse buckets so the UI can filter without reading every title. */
  category: z
    .enum([
      "liturgy",
      "feast",
      "festival",
      "fundraiser",
      "youth",
      "education",
      "retreat",
      "community",
      "music",
      "other",
    ])
    .default("other"),
  recurrence: z.string().optional(), // raw RRULE when the source had one
  provenance: Provenance,
  cancelled: z.boolean().default(false),
});
export type ChurchEvent = z.infer<typeof ChurchEvent>;

/** What the pipeline writes to data/ and the web app imports. */
export const Dataset = z.object({
  generatedAt: z.string().datetime(),
  version: z.string(),
  counts: z.object({
    parishes: z.number().int(),
    events: z.number().int(),
    socials: z.number().int(),
    withCoordinates: z.number().int(),
  }),
  parishes: z.array(Parish),
  events: z.array(ChurchEvent),
});
export type Dataset = z.infer<typeof Dataset>;

/** A raw, pre-normalisation record straight out of a directory page. */
export const ParishCandidate = z.object({
  name: z.string(),
  jurisdictionId: z.string(),
  tradition: TraditionId,
  addressText: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  sourceUrl: z.string(),
  method: Provenance.shape.method,
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ParishCandidate = z.infer<typeof ParishCandidate>;
