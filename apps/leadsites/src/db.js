import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.sitesDir, { recursive: true });
fs.mkdirSync(config.publishedDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS searches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  query         TEXT NOT NULL,
  location      TEXT,
  city          TEXT,
  min_reviews   INTEGER NOT NULL,
  provider      TEXT NOT NULL,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  raw_count     INTEGER NOT NULL DEFAULT 0,
  kept_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS businesses (
  id                  TEXT PRIMARY KEY,
  search_id           INTEGER REFERENCES searches(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  address             TEXT,
  lat                 REAL,
  lng                 REAL,
  phone               TEXT,
  rating              REAL,
  review_count        INTEGER NOT NULL DEFAULT 0,
  website_uri         TEXT,
  google_maps_uri     TEXT,
  primary_type        TEXT,
  types_json          TEXT,
  business_status     TEXT,
  hours_json          TEXT,
  website_status      TEXT NOT NULL DEFAULT 'unchecked',
  website_reason      TEXT,
  website_http_status INTEGER,
  website_final_url   TEXT,
  website_checked_at  TEXT,
  socials_json        TEXT,
  socials_checked_at  TEXT,
  city                TEXT,
  reviews_json        TEXT,
  editorial_summary   TEXT,
  price_level         TEXT,
  details_fetched_at  TEXT,
  vision_json         TEXT,
  score               REAL NOT NULL DEFAULT 0,
  score_breakdown     TEXT,
  status              TEXT NOT NULL DEFAULT 'new',
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_businesses_score  ON businesses(score DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_search ON businesses(search_id);

CREATE TABLE IF NOT EXISTS sites (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL DEFAULT 1,
  design_key    TEXT NOT NULL,
  model         TEXT NOT NULL,
  feedback      TEXT,
  plan_json     TEXT,
  dir_path      TEXT,
  html_path     TEXT,
  pages_json    TEXT,
  bytes         INTEGER,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  status        TEXT NOT NULL DEFAULT 'generating',
  error         TEXT,
  published_at  TEXT,
  published_url TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sites_business ON sites(business_id, version DESC);
`);

export const now = () => new Date().toISOString();

const columns = (table) =>
  db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

/** Bring a database created by an older version up to the current schema. */
function addMissingColumns(table, wanted) {
  const existing = new Set(columns(table));
  for (const [name, type] of Object.entries(wanted)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

addMissingColumns("businesses", {
  city: "TEXT",
  reviews_json: "TEXT",
  editorial_summary: "TEXT",
  price_level: "TEXT",
  details_fetched_at: "TEXT",
  vision_json: "TEXT",
});
addMissingColumns("searches", { city: "TEXT" });
addMissingColumns("sites", {
  plan_json: "TEXT",
  dir_path: "TEXT",
  pages_json: "TEXT",
  cache_read_tokens: "INTEGER",
});

/** INSERT ... ON CONFLICT UPDATE that never clobbers enrichment we already did. */
export function upsertBusiness(row) {
  const cols = columns("businesses").filter((c) => c in row);
  const placeholders = cols.map(() => "?").join(", ");
  // Re-running a search refreshes the Places facts but leaves review state alone.
  const updatable = cols.filter(
    (c) => !["id", "created_at", "status", "notes", "score", "score_breakdown"].includes(c),
  );
  const sql = `
    INSERT INTO businesses (${cols.join(", ")}) VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updatable.map((c) => `${c} = excluded.${c}`).join(", ")}
  `;
  db.prepare(sql).run(...cols.map((c) => row[c] ?? null));
}

export function updateBusiness(id, patch) {
  const cols = Object.keys(patch);
  if (cols.length === 0) return;
  db.prepare(
    `UPDATE businesses SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
  ).run(...cols.map((c) => patch[c] ?? null), now(), id);
}

export const getBusiness = (id) =>
  db.prepare("SELECT * FROM businesses WHERE id = ?").get(id) ?? null;

export function listBusinesses({ status, websiteStatus, minReviews, searchId, limit = 200 } = {}) {
  const where = [];
  const args = [];
  if (status) { where.push("status = ?"); args.push(status); }
  if (websiteStatus) { where.push("website_status = ?"); args.push(websiteStatus); }
  if (minReviews != null) { where.push("review_count >= ?"); args.push(minReviews); }
  if (searchId != null) { where.push("search_id = ?"); args.push(searchId); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM businesses ${clause} ORDER BY score DESC, review_count DESC LIMIT ?`)
    .all(...args, limit);
}

export const getSite = (id) => db.prepare("SELECT * FROM sites WHERE id = ?").get(id) ?? null;

export const listSites = (businessId) =>
  db.prepare("SELECT * FROM sites WHERE business_id = ? ORDER BY version DESC").all(businessId);

export function createSite({ businessId, designKey, model, feedback }) {
  const prev = db
    .prepare("SELECT MAX(version) AS v FROM sites WHERE business_id = ?")
    .get(businessId);
  const version = (prev?.v ?? 0) + 1;
  const info = db
    .prepare(
      `INSERT INTO sites (business_id, version, design_key, model, feedback, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'generating', ?)`,
    )
    .run(businessId, version, designKey, model, feedback ?? null, now());
  return getSite(Number(info.lastInsertRowid));
}

export function updateSite(id, patch) {
  const cols = Object.keys(patch);
  if (cols.length === 0) return;
  db.prepare(`UPDATE sites SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
    ...cols.map((c) => patch[c] ?? null),
    id,
  );
}

export function createSearch({ query, location, city, minReviews, provider }) {
  const info = db
    .prepare(
      `INSERT INTO searches (query, location, city, min_reviews, provider, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(query, location ?? null, city ?? null, minReviews, provider, now());
  return Number(info.lastInsertRowid);
}

export function finishSearch(id, { pagesFetched, rawCount, keptCount }) {
  db.prepare(
    "UPDATE searches SET pages_fetched = ?, raw_count = ?, kept_count = ? WHERE id = ?",
  ).run(pagesFetched, rawCount, keptCount, id);
}

export const listSearches = () =>
  db.prepare("SELECT * FROM searches ORDER BY id DESC LIMIT 50").all();
