/**
 * Re-run the QA gates across stored sites and print the table.
 *
 *   npm run qa                 every site on file
 *   npm run qa -- --site 7     one site
 *   npm run qa -- --json       machine-readable
 *
 * This is how a prompt change gets judged: against the whole corpus, not
 * against one lucky output. The gates are deterministic, so running this
 * needs no key and costs nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { db, getBusiness, getSite, updateSite } from "../db.js";
import { runQa } from "../generate/qa.js";
import { buildSeo } from "../generate/seo.js";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const siteFlag = flag("site");
const rows = siteFlag
  ? [getSite(Number(siteFlag))].filter(Boolean)
  : db.prepare("SELECT * FROM sites WHERE dir_path IS NOT NULL ORDER BY id").all();

if (rows.length === 0) {
  console.error(siteFlag ? `No such site: ${siteFlag}` : "No generated sites on file.");
  process.exit(1);
}

const results = [];

for (const site of rows) {
  const business = getBusiness(site.business_id);
  const plan = JSON.parse(site.plan_json ?? "null");
  const brief = JSON.parse(site.brief_json ?? "null");

  if (!business || !plan || !site.dir_path || !fs.existsSync(site.dir_path)) {
    results.push({ site: site.id, name: business?.name ?? site.business_id, skipped: "no plan or no files on disk" });
    continue;
  }

  const pages = JSON.parse(site.pages_json ?? "[]")
    .map((p) => ({ ...p, full: path.join(site.dir_path, p.file) }))
    .filter((p) => fs.existsSync(p.full))
    .map((p) => ({ ...p, html: fs.readFileSync(p.full, "utf8") }));

  if (pages.length === 0) {
    results.push({ site: site.id, name: business.name, skipped: "no pages on disk" });
    continue;
  }

  const seo = JSON.parse(site.seo_json ?? "null") ?? buildSeo({ business, plan, brief });
  const qa = runQa({ business, plan, brief, seo, pages });

  // Re-running the gates is also the way to bring an older version's stored
  // verdict up to date, so store what we just measured.
  if (!has("dry-run")) updateSite(site.id, { qa_json: JSON.stringify(qa) });

  results.push({
    site: site.id,
    version: site.version,
    name: business.name,
    design: site.design_key,
    hasBrief: Boolean(brief),
    pages: pages.length,
    publishable: qa.publishable,
    score: qa.score,
    hardFails: qa.hardFails.map((f) => f.id),
    warnings: qa.warnings.map((w) => w.id),
    qa,
  });
}

if (has("json")) {
  process.stdout.write(`${JSON.stringify(results.map(({ qa, ...rest }) => (has("full") ? { ...rest, qa } : rest)), null, 2)}\n`);
  process.exit(0);
}

const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n);

console.log("");
console.log(`  ${pad("site", 6)}${pad("business", 34)}${pad("design", 14)}${pad("brief", 6)}${pad("pg", 4)}${pad("score", 6)}verdict`);
console.log(`  ${"-".repeat(84)}`);

for (const r of results) {
  if (r.skipped) {
    console.log(`  ${pad(r.site, 6)}${pad(r.name, 34)}${pad("", 14)}${pad("", 6)}${pad("", 4)}${pad("", 6)}skipped: ${r.skipped}`);
    continue;
  }
  const verdict = r.publishable
    ? r.warnings.length === 0
      ? "clean"
      : `warn: ${r.warnings.join(", ")}`
    : `BLOCKED: ${r.hardFails.join(", ")}`;
  console.log(
    `  ${pad(`${r.site}v${r.version}`, 6)}${pad(r.name, 34)}${pad(r.design, 14)}${pad(r.hasBrief ? "yes" : "no", 6)}${pad(r.pages, 4)}${pad(r.score == null ? "-" : `${r.score}%`, 6)}${verdict}`,
  );
}

const graded = results.filter((r) => !r.skipped);
const blocked = graded.filter((r) => !r.publishable);
console.log("");
console.log(`  ${graded.length} site(s) graded, ${blocked.length} blocked by a hard gate.`);
if (graded.length > 0) {
  const scored = graded.filter((r) => r.score != null);
  if (scored.length > 0) {
    console.log(`  mean advisory score: ${Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length)}%`);
  }
}
console.log("");

process.exit(blocked.length > 0 ? 2 : 0);
