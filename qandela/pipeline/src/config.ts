import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(here, "../..");
export const DATA_DIR = resolve(REPO, "data");
export const CACHE_DIR = resolve(REPO, ".cache");

/** Minimal .env loader so the pipeline has no dotenv dependency. */
function loadEnvFile() {
  const path = resolve(REPO, ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvFile();

export const config = {
  userAgent:
    process.env.CRAWL_USER_AGENT ??
    "qandela/0.1 (+https://github.com/YOURORG/qandela)",
  concurrency: Number(process.env.CRAWL_CONCURRENCY ?? 4),
  /** Per-host politeness delay. Church sites are small; do not hammer them. */
  delayMs: Number(process.env.CRAWL_DELAY_MS ?? 1500),
  cacheTtlHours: Number(process.env.CRAWL_CACHE_TTL_HOURS ?? 168),
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "claude-sonnet-5",
  llmModelHard: process.env.LLM_MODEL_HARD ?? "claude-opus-5",
  geocoderContact: process.env.GEOCODER_CONTACT ?? "",
  meta: {
    appId: process.env.META_APP_ID ?? "",
    appSecret: process.env.META_APP_SECRET ?? "",
    pageTokensFile: process.env.META_PAGE_TOKENS_FILE ?? "./secrets/meta-page-tokens.json",
  },
};
