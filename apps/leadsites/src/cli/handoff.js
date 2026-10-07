/**
 * Write the handoff document for one business: everything the built-in
 * generator would have sent to the model, in one file.
 *
 *   npm run handoff -- <businessId> [--design ferrari] [--out FILE] [--no-design]
 *                                   [--no-rivals]
 *
 * Leave --design off and the document asks the model to choose the design
 * system from the catalogue, which is what the app itself now does.
 */
import fs from "node:fs";
import { getBusiness, listBusinesses } from "../db.js";
import { runResearch } from "../generate/creative-brief.js";
import { listDesigns } from "../generate/designs.js";
import { buildHandoff } from "../generate/handoff.js";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const businessId = args[0]?.startsWith("--") ? null : args[0];

if (!businessId) {
  const rows = listBusinesses({ limit: 20 });
  console.error("Usage: npm run handoff -- <businessId> [--design <key>] [--out FILE] [--no-design] [--no-rivals]\n");
  if (rows.length > 0) {
    console.error("Top saved leads:\n");
    for (const b of rows.slice(0, 12)) {
      console.error(`  ${b.id.padEnd(30)} ${String(b.score).padStart(5)}  ${b.website_status.padEnd(14)} ${b.name}`);
    }
  } else {
    console.error("No leads saved yet - run a search first, or add one by name.");
  }
  process.exit(1);
}

const business = getBusiness(businessId);
if (!business) {
  console.error(`No such business: ${businessId}`);
  process.exit(1);
}

const designKey = flag("design");
if (designKey && !listDesigns().some((d) => d.key === designKey)) {
  console.error(`No such design: ${designKey}`);
  process.exit(1);
}

const research = await runResearch(business, { fetchRivals: has("no-rivals") ? 0 : 3 });
const doc = buildHandoff({ business, research, designKey, includeDesign: !has("no-design") });
const out = flag("out");

if (out) {
  fs.writeFileSync(out, doc, "utf8");
  console.error(
    `Wrote ${out} (${(doc.length / 1024).toFixed(0)} kB) for ${business.name}` +
      (designKey ? `, design "${designKey}".` : ", design chosen by the brief."),
  );
  console.error(
    research.competitors.basis === "scanned-set"
      ? `Competitive set: ${research.competitors.setSize} businesses, this one ranks #${research.competitors.rank} by reviews.`
      : `Competitive set: ${research.competitors.note}`,
  );
} else {
  process.stdout.write(doc);
}
