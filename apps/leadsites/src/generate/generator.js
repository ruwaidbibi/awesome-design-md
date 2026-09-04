import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { createSite, getSite, listSites, updateSite } from "../db.js";
import { HttpError } from "../http.js";
import { readDesign } from "./designs.js";
import { planSite } from "./planner.js";
import { renderSite } from "./renderer.js";
import { validatePlan, weakSections } from "./schema.js";

export { extractHtml } from "./renderer.js";

const siteDir = (site) => path.join(config.sitesDir, `${site.business_id}-v${site.version}`);

function writePages(site, pages) {
  const dir = siteDir(site);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  let bytes = 0;
  for (const page of pages) {
    fs.writeFileSync(path.join(dir, page.file), page.html, "utf8");
    bytes += Buffer.byteLength(page.html);
  }
  return { dir, bytes, index: path.join(dir, "index.html") };
}

const pageSummary = (pages) => pages.map(({ slug, file, title }) => ({ slug, file, title }));

/**
 * Plan the site, then build it.
 *
 * Two stages on purpose. The plan is small enough to read, and every section in
 * it says what evidence entitles it to exist, so the decision about what the
 * site claims is auditable before any HTML is written. The plan is emitted as
 * its own event mid-stream, and stored, so it can be edited and re-rendered
 * without re-planning.
 */
export async function generateSite(
  { business, designKey, feedback = null, previousSiteId = null },
  onEvent = () => {},
) {
  const design = readDesign(designKey);

  let previousHome = null;
  if (feedback) {
    const prior = previousSiteId
      ? getSite(previousSiteId)
      : listSites(business.id).find((s) => s.html_path && s.status !== "failed");
    if (prior?.html_path && fs.existsSync(prior.html_path)) {
      previousHome = fs.readFileSync(prior.html_path, "utf8");
    } else {
      onEvent({ type: "note", message: "No previous version on disk; building from scratch." });
    }
  }

  const site = createSite({ businessId: business.id, designKey, model: config.gen.model, feedback });
  onEvent({ type: "start", siteId: site.id, version: site.version, design: designKey, model: config.gen.model });

  try {
    onEvent({ type: "stage", stage: "planning" });
    const { plan, usage: planUsage } = await planSite({ business, design }, onEvent);

    updateSite(site.id, { plan_json: JSON.stringify(plan), status: "planned" });
    onEvent({ type: "plan", plan, weak: weakSections(plan), pages: plan.pages.length });

    onEvent({ type: "stage", stage: "rendering" });
    const built = await buildFromPlan({ site, business, design, plan, feedback, previousHome, planUsage }, onEvent);
    return built;
  } catch (err) {
    updateSite(site.id, { status: "failed", error: err.message?.slice(0, 500) ?? "Unknown error" });
    onEvent({ type: "error", message: err.message, detail: err.detail ?? null });
    throw err;
  }
}

/** Render an existing site row's stored plan. Used after editing a plan by hand. */
export async function rebuildSite({ site, business }, onEvent = () => {}) {
  const plan = JSON.parse(site.plan_json ?? "null");
  const problems = validatePlan(plan);
  if (problems.length > 0) throw new HttpError(400, `Stored plan is not usable: ${problems.join("; ")}`);

  const design = readDesign(site.design_key);
  onEvent({ type: "start", siteId: site.id, version: site.version, design: site.design_key, model: site.model });
  onEvent({ type: "stage", stage: "rendering" });

  try {
    return await buildFromPlan({ site, business, design, plan }, onEvent);
  } catch (err) {
    updateSite(site.id, { status: "failed", error: err.message?.slice(0, 500) ?? "Unknown error" });
    onEvent({ type: "error", message: err.message, detail: err.detail ?? null });
    throw err;
  }
}

async function buildFromPlan(
  { site, business, design, plan, feedback = null, previousHome = null, planUsage = null },
  onEvent,
) {
  const { pages, usage, shellReused } = await renderSite(
    { business, design, plan, feedback, previousHome },
    onEvent,
  );

  if (pages.length === 0) throw new HttpError(502, "No pages were produced");

  const { dir, bytes, index } = writePages(site, pages);

  updateSite(site.id, {
    dir_path: dir,
    html_path: index,
    pages_json: JSON.stringify(pageSummary(pages)),
    bytes,
    input_tokens: (planUsage?.input ?? 0) + usage.input,
    output_tokens: (planUsage?.output ?? 0) + usage.output,
    cache_read_tokens: (planUsage?.cacheRead ?? 0) + usage.cacheRead,
    status: "ready",
    error: shellReused ? null : "Pages were generated individually; check them for styling drift.",
  });

  const finished = getSite(site.id);
  onEvent({ type: "done", site: finished, pages: pageSummary(pages) });
  return finished;
}
