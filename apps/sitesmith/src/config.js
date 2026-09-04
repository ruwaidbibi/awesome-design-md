import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const bool = (v, fallback = false) =>
  v == null || v === "" ? fallback : ["1", "true", "yes", "on"].includes(String(v).toLowerCase());

const int = (v, fallback) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};

export const appRoot = path.resolve(here, "..");
export const repoRoot = path.resolve(appRoot, "..", "..");

export const config = {
  port: int(process.env.PORT, 4317),

  appRoot,
  repoRoot,
  dataDir: path.join(appRoot, "data"),
  sitesDir: path.join(appRoot, "data", "sites"),
  publishedDir: path.join(appRoot, "data", "published"),
  dbPath: path.join(appRoot, "data", "sitesmith.db"),
  designDir: path.join(repoRoot, "design-md"),

  places: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    // Fall back to fixtures rather than failing every search on a missing key.
    provider: process.env.PLACES_PROVIDER || (process.env.GOOGLE_MAPS_API_KEY ? "places" : "fixtures"),
    maxPages: Math.min(Math.max(int(process.env.MAX_PAGES, 3), 1), 3),
  },

  gen: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.GEN_MODEL || "claude-opus-5",
    effort: process.env.GEN_EFFORT || "high",
    photoVision: bool(process.env.PHOTO_VISION, false),
    photoVisionMax: Math.min(Math.max(int(process.env.PHOTO_VISION_MAX, 4), 1), 8),
  },

  social: {
    braveKey: process.env.BRAVE_SEARCH_KEY || "",
    serpApiKey: process.env.SERPAPI_KEY || "",
    guess: bool(process.env.SOCIAL_GUESS, false),
  },
};

export const hasGenKey = () => Boolean(config.gen.apiKey || process.env.ANTHROPIC_AUTH_TOKEN);
