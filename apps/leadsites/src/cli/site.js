/**
 * One business, end to end, from the command line.
 *
 *   npm run site -- "Blessed Hands Barber Parlor, Chicago"
 *   npm run site -- ChIJ...                      a place id already on file
 *   npm run site -- "https://www.google.com/maps/place/K+Cuts+Barbershop/@..."
 *
 * Flags:
 *   --design <key>   override the design choice instead of letting the brief pick
 *   --no-rivals      skip reading rival homepages (no outbound requests)
 *   --no-details     do not fetch reviews, even if none are on file
 *   --out FILE       where to write the handoff when there is no API key
 *   --pick N         take the Nth name match instead of asking
 *
 * This is the single-business path. It exists because "build a site for this
 * one business" is a different job from prospecting, and it should not require
 * running a search sweep and then clicking through a list of sixty.
 *
 * Lookup by name is deliberately NOT fenced to the metro: you already know who
 * you want.
 */
import fs from "node:fs";
import { getBusiness } from "../db.js";
import { runResearch } from "../generate/creative-brief.js";
import { listDesigns } from "../generate/designs.js";
import { generateSite } from "../generate/generator.js";
import { buildHandoff } from "../generate/handoff.js";
import { hasGenKey } from "../config.js";
import { parseMapsLink } from "../maps-link.js";
import { contentContext, fetchDetails } from "../pipeline/content.js";
import { addByName } from "../pipeline/prospect.js";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const target = args[0]?.startsWith("--") ? null : args[0];

if (!target) {
  console.error(`Usage: npm run site -- "<business name, city>" | <placeId> | <google maps url>

  --design <key>   override the design choice (default: the brief chooses)
  --no-rivals      skip reading rival homepages
  --no-details     do not fetch reviews
  --out FILE       where to write the handoff when there is no API key
  --pick N         take the Nth name match without asking
`);
  process.exit(1);
}

const designKey = flag("design");
if (designKey && !listDesigns().some((d) => d.key === designKey)) {
  console.error(`No such design: ${designKey}. Run with no --design to let the brief choose.`);
  process.exit(1);
}

async function resolve(input) {
  const onFile = getBusiness(input);
  if (onFile) {
    console.error(`On file: ${onFile.name} (${onFile.id})`);
    return onFile;
  }

  const parsed = parseMapsLink(input);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }
  if (parsed.placeId) {
    const byId = getBusiness(parsed.placeId);
    if (byId) return byId;
    console.error(`Place id ${parsed.placeId} is not on file yet; looking it up by id is not supported - search by name instead.`);
    process.exit(1);
  }

  console.error(`Looking up "${parsed.query}" (${parsed.from}), unfenced...`);
  const { matches } = await addByName({ query: parsed.query, limit: 5 }, (p) => {
    if (p.phase === "searched") console.error(`  ${p.found} match(es), ${p.billedRequests} billed request(s)`);
  });

  if (matches.length === 0) {
    console.error("No match. Try the full name plus the city.");
    process.exit(1);
  }

  const pick = flag("pick");
  if (matches.length > 1 && !pick) {
    console.error("\nSeveral matches. Re-run with --pick N:\n");
    matches.forEach((m, i) => {
      console.error(`  ${i + 1}. ${m.name} — ${m.address ?? "no address"}`);
      console.error(`     ${m.rating ?? "?"}★ from ${m.review_count} reviews · website: ${m.website_status} · ${m.id}`);
    });
    console.error("");
    process.exit(1);
  }

  const chosen = matches[pick ? Number(pick) - 1 : 0];
  if (!chosen) {
    console.error(`--pick ${pick} is out of range; there were ${matches.length} matches.`);
    process.exit(1);
  }
  return chosen;
}

const business = await resolve(target);

console.error(`
${business.name}
  ${business.address ?? "no address"}
  ${business.rating ?? "?"}★ from ${business.review_count} reviews
  website: ${business.website_status}${business.website_reason ? ` — ${business.website_reason}` : ""}
`);

/* Reviews. One billed Enterprise + Atmosphere request, and only for a business
   someone has actually chosen - which is the whole reason this is a separate
   call from the search. */
let current = business;
if (!has("no-details")) {
  const before = contentContext(current);
  if (before.usable) {
    console.error(`Reviews already on file (${before.reviews.length}, fetched ${before.ageDays} day(s) ago).`);
  } else {
    const { business: updated, billedRequests, cached } = await fetchDetails(current.id);
    current = updated;
    const after = contentContext(current);
    console.error(`Reviews: ${after.reviews.length} on file${cached ? " (cached)" : `, ${billedRequests} billed request(s)`}.`);
  }
}

/* Stage 1. Free. */
console.error("\nResearching...");
const research = await runResearch(current, { fetchRivals: has("no-rivals") ? 0 : 3 });

const set = research.competitors;
console.error(
  set.basis === "scanned-set"
    ? `  set: ${set.setSize} ${(set.category ?? "businesses").replace(/_/g, " ")} within ${set.radiusKm}km · rank #${set.rank} · ${set.reviewPercentile}th percentile · ${set.websites.live}/${set.peerCount} rivals have a live site`
    : `  set: ${set.note}`,
);
console.error(
  research.rivals.basis === "observed"
    ? `  rivals: read ${research.rivals.read}${research.rivals.crowdedHues.length ? ` · crowded locally: ${research.rivals.crowdedHues.map((h) => h.name).join(", ")}` : ""}`
    : `  rivals: ${research.rivals.note}`,
);
if (research.brand.vocabulary.length > 0) {
  console.error(`  customers say: ${research.brand.vocabulary.slice(0, 10).map((v) => v.word).join(", ")}`);
}
console.error(`  schema: ${research.localSeo.schemaType} · ${research.localSeo.queryPatterns.length} query patterns · ${research.localSeo.gbp.length} profile recommendations`);

/* Stages 2-6, if there is a key. Otherwise the handoff, which carries all of
   the above plus every prompt, so the same work can be done by hand. */
if (!hasGenKey()) {
  const out = flag("out") ?? `handoff-${business.id}.md`;
  fs.writeFileSync(out, buildHandoff({ business: current, research, designKey, includeDesign: Boolean(designKey) }), "utf8");
  console.error(`
No ANTHROPIC_API_KEY, so stages 2-4 cannot run here.

Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} kB). It carries the research
above, all three system prompts and both schemas. Take it to a Claude session,
save brief.json, plan.json and one .html per page into a directory, then:

  npm run import -- ${business.id} --dir <dir> --model claude-code

The import runs the SEO and QA stages, so the result is treated exactly like a
site generated here.`);
  process.exit(0);
}

console.error("\nGenerating...");
const site = await generateSite(
  { business: current, designKey, fetchRivals: has("no-rivals") ? 0 : 3 },
  (event) => {
    if (event.type === "stage") console.error(`  [${event.stage}]`);
    if (event.type === "brief") console.error(`  design: ${event.design} — ${event.brief.artDirection.designRationale}`);
    if (event.type === "plan") {
      console.error(`  plan: ${event.pages} page(s)`);
      for (const d of event.drift ?? []) console.error(`    drift: ${d}`);
    }
    if (event.type === "page") console.error(`  page ${event.index}/${event.total}: ${event.slug}`);
    if (event.type === "note") console.error(`  note: ${event.message}`);
  },
);

const qa = JSON.parse(site.qa_json ?? "null");
console.error("");
for (const g of qa?.gates ?? []) {
  console.error(`  ${(g.pass ? "pass" : g.level === "hard" ? "FAIL" : "warn").padEnd(5)} ${g.label}${g.detail ? ` — ${g.detail}` : ""}`);
}
console.error(`
v${site.version} (site ${site.id}) · ${JSON.parse(site.pages_json).length} page(s) · ${(site.bytes / 1024).toFixed(0)} kB
Preview at http://localhost:${process.env.PORT ?? 4317}/preview/${site.id}`);

if (qa && !qa.publishable) {
  console.error(`\nQA blocked this version: ${qa.hardFails.map((f) => f.label).join("; ")}`);
  process.exit(2);
}
