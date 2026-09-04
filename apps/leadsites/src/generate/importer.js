import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { createSite, getBusiness, getSite, updateSite } from "../db.js";
import { HttpError } from "../http.js";
import { validatePlan } from "./schema.js";

const fileFor = (slug) => (slug === "index" ? "index.html" : `${slug}.html`);

/**
 * Take a site generated outside this app and store it as a normal version.
 *
 * Everything downstream - preview, page tabs, the plan panel, publish - reads
 * the same rows, so an imported site behaves exactly like a generated one. The
 * model is recorded as whatever produced it so the versions list stays honest.
 */
export function importSite({ businessId, designKey, plan, pages, model = "external" }) {
  const business = getBusiness(businessId);
  if (!business) throw new HttpError(404, `No such business: ${businessId}`);

  const problems = validatePlan(plan);
  if (problems.length > 0) throw new HttpError(400, `Plan is not usable: ${problems.join("; ")}`);

  // Every page the plan promises must have arrived, and nothing else may.
  const planned = new Map(plan.pages.map((p) => [fileFor(p.slug), p]));
  const supplied = new Map(pages.map((p) => [p.file, p]));

  const missing = [...planned.keys()].filter((f) => !supplied.has(f));
  if (missing.length > 0) throw new HttpError(400, `The plan lists pages that were not supplied: ${missing.join(", ")}`);

  const extra = [...supplied.keys()].filter((f) => !planned.has(f));
  if (extra.length > 0) throw new HttpError(400, `Supplied pages that the plan does not list: ${extra.join(", ")}`);

  for (const [file, page] of supplied) {
    if (!/<html[\s>]/i.test(page.html)) throw new HttpError(400, `${file} is not an HTML document`);
    if (/<(script|link|img)[^>]+(src|href)=["']https?:/i.test(page.html)) {
      throw new HttpError(400, `${file} references an external resource; pages must be self-contained`);
    }
  }

  const site = createSite({ businessId, designKey, model, feedback: null });
  updateSite(site.id, { plan_json: JSON.stringify(plan), status: "planned" });

  const dir = path.join(config.sitesDir, `${businessId}-v${site.version}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  // index first, then plan order - the nav and the page tabs both rely on it.
  const ordered = plan.pages.map((p) => ({ ...supplied.get(fileFor(p.slug)), slug: p.slug, title: p.title }));

  let bytes = 0;
  for (const page of ordered) {
    fs.writeFileSync(path.join(dir, page.file), page.html, "utf8");
    bytes += Buffer.byteLength(page.html);
  }

  updateSite(site.id, {
    dir_path: dir,
    html_path: path.join(dir, "index.html"),
    pages_json: JSON.stringify(ordered.map(({ slug, file, title }) => ({ slug, file, title }))),
    bytes,
    status: "ready",
  });

  return getSite(site.id);
}

/** Read a directory laid out as the brief describes: plan.json plus one html file per page. */
export function readSiteDir(dir) {
  const planPath = path.join(dir, "plan.json");
  if (!fs.existsSync(planPath)) throw new HttpError(400, `No plan.json in ${dir}`);

  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const pages = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .map((file) => ({ file, html: fs.readFileSync(path.join(dir, file), "utf8") }));

  return { plan, pages };
}
