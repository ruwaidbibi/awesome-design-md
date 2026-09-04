/**
 * Mirrors pipeline/src/schema.ts. Kept as a separate declaration rather than
 * imported so the web app can be deployed without the pipeline workspace.
 */
export type TraditionId =
  | "maronite"
  | "chaldean"
  | "melkite"
  | "greek-orthodox"
  | "coptic-orthodox"
  | "syriac-orthodox"
  | "assyrian-coe";

export type SocialPlatform =
  | "facebook" | "instagram" | "youtube" | "x" | "tiktok" | "whatsapp"
  | "telegram" | "linkedin" | "flickr" | "soundcloud" | "spotify" | "podcast";

export interface Provenance {
  source: string;
  url?: string;
  method: "jsonld" | "microdata" | "ical" | "rss" | "heuristic" | "llm" | "api" | "manual";
  fetchedAt: string;
  confidence: number;
}

export interface SocialAccount {
  platform: SocialPlatform;
  url: string;
  handle?: string;
  followers?: number;
  verified?: boolean;
  lastCheckedAt?: string;
  provenance: Provenance;
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country: "US";
  formatted?: string;
}

export interface Coordinates {
  lat: number;
  lon: number;
  precision: "rooftop" | "interpolated" | "centroid" | "unknown";
  source: "census" | "nominatim" | "openstreetmap" | "directory" | "manual";
}

export interface ServiceTime {
  label: string;
  dayOfWeek?: number;
  time?: string;
  language?: string;
  note?: string;
}

export interface Parish {
  id: string;
  name: string;
  alternateNames: string[];
  tradition: TraditionId;
  jurisdictionId: string;
  subJurisdiction?: string;
  status: "parish" | "mission" | "cathedral" | "monastery" | "chapel" | "unknown";
  address?: Address;
  coordinates?: Coordinates;
  phone?: string;
  email?: string;
  website?: string;
  clergy: { title?: string; name: string }[];
  languages: string[];
  serviceTimes: ServiceTime[];
  socials: SocialAccount[];
  feeds: { type: "ical" | "rss" | "jsonld" | "html"; url: string }[];
  provenance: Provenance[];
  mergedFrom: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  flags: string[];
}

export type EventCategory =
  | "liturgy" | "feast" | "festival" | "fundraiser" | "youth"
  | "education" | "retreat" | "community" | "music" | "other";

export interface ChurchEvent {
  id: string;
  parishId: string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  allDay: boolean;
  timezone?: string;
  location?: string;
  url?: string;
  imageUrl?: string;
  category: EventCategory;
  recurrence?: string;
  provenance: Provenance;
  cancelled: boolean;
}

export interface Dataset {
  generatedAt: string;
  version: string;
  counts: { parishes: number; events: number; socials: number; withCoordinates: number };
  parishes: Parish[];
  events: ChurchEvent[];
}

export interface Tradition {
  id: TraditionId;
  name: string;
  family: string;
  rite: string;
  liturgicalLanguages: string[];
  communion: string;
  estimatedUsParishes: number;
}

export interface Jurisdiction {
  id: string;
  tradition: TraditionId;
  name: string;
  seat?: string;
  territory?: string;
  site: string;
  confidence: "verified" | "reported" | "pattern";
  note?: string;
}

export interface Registry {
  traditions: Tradition[];
  jurisdictions: Jurisdiction[];
}
