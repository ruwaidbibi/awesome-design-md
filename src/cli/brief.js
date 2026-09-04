/**
 * Write the generation brief for one business.
 *
 *   npm run brief -- <businessId> --design stripe [--out FILE] [--no-design]
 */
import fs from "node:fs";
import { getBusiness, listBusinesses } from "../db.js";
import { buildBrief } from "../generate/brief.js";
import { listDesigns } from "../generate/designs.js";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const businessId = args[0]?.startsWith("--") ? null : args[0];

if (!businessId) {
  const rows = listBusinesses({ limit: 20 });
  console.error("Usage: npm run brief -- <businessId> --design <key> [--out FILE] [--no-design]\n");
  if (rows.length > 0) {
    console.error("Top saved leads:\n");
    for (const b of rows.slice(0, 12)) {
      console.error(`  ${b.id.padEnd(30)} ${String(b.score).padStart(5)}  ${b.website_status.padEnd(14)} ${b.name}`);
    }
  } else {
    console.error("No leads saved yet - run a search first.");
  }
  process.exit(1);
}

const business = getBusiness(businessId);
if (!business) {
  console.error(`No such business: ${businessId}`);
  process.exit(1);
}

const designKey = flag("design") ?? listDesigns()[0]?.key;
if (!designKey) {
  console.error("No design systems found.");
  process.exit(1);
}
if (!listDesigns().some((d) => d.key === designKey)) {
  console.error(`No such design: ${designKey}`);
  process.exit(1);
}

const brief = buildBrief({ business, designKey, includeDesign: !has("no-design") });
const out = flag("out");

if (out) {
  fs.writeFileSync(out, brief, "utf8");
  console.error(`Wrote ${out} (${(brief.length / 1024).toFixed(0)} kB) for ${business.name}, design "${designKey}".`);
} else {
  process.stdout.write(brief);
}
