/**
 * Import a site generated outside this app.
 *
 *   npm run import -- <businessId> --design stripe --dir path/to/output [--model claude-code]
 *
 * The directory must contain plan.json and one .html file per page in the plan.
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

if (!businessId || !dir || !designKey) {
  console.error("Usage: npm run import -- <businessId> --design <key> --dir <dir> [--model <name>]");
  process.exit(1);
}
if (!getBusiness(businessId)) {
  console.error(`No such business: ${businessId}`);
  process.exit(1);
}

try {
  const { plan, pages } = readSiteDir(dir);
  const site = importSite({
    businessId,
    designKey,
    plan,
    pages,
    model: flag("model", "external"),
  });
  const files = JSON.parse(site.pages_json).map((p) => p.file);
  console.error(`Imported as v${site.version} (site ${site.id}): ${files.join(", ")}`);
  console.error(`Preview at http://localhost:${process.env.PORT ?? 4317}/preview/${site.id}`);
} catch (err) {
  console.error(`Import failed: ${err.message}`);
  process.exit(1);
}
