/**
 * Import a site generated outside this app.
 *
 *   npm run import -- <businessId> --dir path/to/output [--design ferrari] [--model claude-code]
 *
 * The directory must contain plan.json and one .html file per page in the plan.
 * brief.json is optional but worth supplying: with it, the QA gates can check
 * the site against the strategy it was meant to follow.
 *
 * --design is only needed when there is no brief.json, since a brief has
 * already chosen the design system.
 */
import { getBusiness } from "../db.js";
import { importSite, readSiteDir } from "../generate/importer.js";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const businessId = args[0];
const dir = flag("dir");
const designKey = flag("design");

if (!businessId || !dir) {
  console.error("Usage: npm run import -- <businessId> --dir <dir> [--design <key>] [--model <name>]");
  process.exit(1);
}
if (!getBusiness(businessId)) {
  console.error(`No such business: ${businessId}`);
  process.exit(1);
}

try {
  const { plan, brief, pages } = readSiteDir(dir);
  const { site, qa, drift } = importSite({
    businessId,
    designKey,
    brief,
    plan,
    pages,
    model: flag("model", "external"),
  });

  const files = JSON.parse(site.pages_json).map((p) => p.file);
  console.error(`Imported as v${site.version} (site ${site.id}): ${files.join(", ")}`);
  console.error(`Design: ${site.design_key}${brief ? " (from brief.json)" : ""}`);

  for (const problem of drift) console.error(`  drift: ${problem}`);

  console.error("");
  for (const gate of qa.gates) {
    const mark = gate.pass ? "pass" : gate.level === "hard" ? "FAIL" : "warn";
    console.error(`  ${mark.padEnd(5)} ${gate.label}${gate.detail ? ` - ${gate.detail}` : ""}`);
  }
  console.error("");
  console.error(
    qa.publishable
      ? `QA: publishable${qa.score == null ? "" : `, ${qa.score}% of the advisory checks clean`}.`
      : `QA: BLOCKED by ${qa.hardFails.length} hard gate(s).`,
  );
  console.error(`Preview at http://localhost:${process.env.PORT ?? 4317}/preview/${site.id}`);

  if (!qa.publishable) process.exit(2);
} catch (err) {
  console.error(`Import failed: ${err.message}`);
  process.exit(1);
}
