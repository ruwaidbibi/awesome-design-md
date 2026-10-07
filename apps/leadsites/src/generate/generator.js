import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { createSite, getSite, listSites, updateSite } from "../db.js";
import { HttpError } from "../http.js";
import { runResearch, writeBrief } from "./creative-brief.js";
import { readDesign } from "./designs.js";
import { planSite } from "./planner.js";
import { runQa } from "./qa.js";
import { renderSite } from "./renderer.js";
import { applySeoToPages, buildSeo } from "./seo.js";
import { validateBrief, validatePlan, weakSections } from "./schema.js";

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
 * Six stages, one call.
 *
 *   1  research      competitive set, brand signals, local search   no model call
 *   2  brief         strategy and art direction, design chosen      one call
 *   3  plan          what each section says, and on what evidence   one call
 *   4  render        the HTML                                       one call per page
 *   5  SEO           titles, descriptions, JSON-LD                  no model call
 *   6  QA            the gates that decide whether it may publish   no model call
 *
 * Four of the six cost nothing but milliseconds, which is the answer to the
 * obvious objection: adding research, strategy and QA to a one-click flow does
 * not make it slow, because most of it is arithmetic over data we already hold.
 *
 * `designKey` is now optional. Left null, stage 2 chooses the design system and
 * has to justify the choice against the rivals it was shown; passed, it becomes
 * an operator override that the brief still has to comment on.
 */
export async function generateSite(
  { business, designKey = null, feedback = null, previousSiteId = null, fetchRivals = 3 },
  onEvent = () => {},
) {
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

  // The row exists before the first model call so a failure anywhere after
  // this point is recorded against a version rather than vanishing.
  const site = createSite({
    businessId: business.id,
    designKey: designKey ?? "auto",
    model: config.gen.model,
    feedback,
  });
  onEvent({ type: "start", siteId: site.id, version: site.version, design: designKey ?? "auto", model: config.gen.model });

  try {
    onEvent({ type: "stage", stage: "research" });
    const research = await runResearch(business, { fetchRivals });
    updateSite(site.id, { research_json: JSON.stringify(research) });
    onEvent({
      type: "research",
      research,
      summary: researchSummary(research),
    });

    onEvent({ type: "stage", stage: "briefing" });
    const { brief, usage: briefUsage } = await writeBrief({ business, research, designKey }, onEvent);
    const chosen = brief.artDirection.designKey;
    updateSite(site.id, { brief_json: JSON.stringify(brief), design_key: chosen });
    onEvent({ type: "brief", brief, design: chosen, chosenByModel: !designKey });

    const design = readDesign(chosen);

    onEvent({ type: "stage", stage: "planning" });
    const { plan, drift, usage: planUsage } = await planSite({ business, design, brief }, onEvent);

    updateSite(site.id, { plan_json: JSON.stringify(plan), status: "planned" });
    onEvent({ type: "plan", plan, weak: weakSections(plan), drift, pages: plan.pages.length });

    onEvent({ type: "stage", stage: "rendering" });
    return await buildFromPlan(
      { site, business, design, plan, brief, feedback, previousHome, priorUsage: [briefUsage, planUsage] },
      onEvent,
    );
  } catch (err) {
    updateSite(site.id, { status: "failed", error: err.message?.slice(0, 500) ?? "Unknown error" });
    onEvent({ type: "error", message: err.message, detail: err.detail ?? null });
    throw err;
  }
}

/** One line per research finding, for the log. */
function researchSummary(research) {
  const lines = [];
  const set = research.competitors;
  if (set.basis === "scanned-set") {
    lines.push(
      `${set.setSize} ${set.category ?? "businesses"} within ${set.radiusKm}km: this one ranks #${set.rank} by reviews (${set.reviewPercentile}th percentile), ${set.websites.live} of ${set.peerCount} rivals have a live site.`,
    );
  } else {
    lines.push(set.note);
  }
  if (research.rivals.basis === "observed") {
    const hues = research.rivals.crowdedHues.map((h) => h.name).join(", ");
    lines.push(
      `Read ${research.rivals.read} rival homepage(s)${hues ? `; the crowded palette locally is ${hues}` : ""}.`,
    );
  } else {
    lines.push(research.rivals.note);
  }
  if (research.brand.vocabulary.length > 0) {
    lines.push(`Customer vocabulary: ${research.brand.vocabulary.slice(0, 8).map((v) => v.word).join(", ")}.`);
  }
  lines.push(`Schema type ${research.localSeo.schemaType}; ${research.localSeo.queryPatterns.length} query patterns.`);
  return lines;
}

/**
 * Render an existing site row's stored plan.
 *
 * Used after editing a plan by hand. Reuses the stored brief rather than
 * re-briefing, so an edit to the copy cannot silently change the strategy.
 */
export async function rebuildSite({ site, business }, onEvent = () => {}) {
  const plan = JSON.parse(site.plan_json ?? "null");
  const problems = validatePlan(plan);
  if (problems.length > 0) throw new HttpError(400, `Stored plan is not usable: ${problems.join("; ")}`);

  const brief = JSON.parse(site.brief_json ?? "null");
  if (brief && validateBrief(brief).length > 0) {
    onEvent({ type: "note", message: "The stored brief is not usable; rendering from the plan alone." });
  }

  const design = readDesign(site.design_key);
  onEvent({ type: "start", siteId: site.id, version: site.version, design: site.design_key, model: site.model });
  onEvent({ type: "stage", stage: "rendering" });

  try {
    return await buildFromPlan({ site, business, design, plan, brief }, onEvent);
  } catch (err) {
    updateSite(site.id, { status: "failed", error: err.message?.slice(0, 500) ?? "Unknown error" });
    onEvent({ type: "error", message: err.message, detail: err.detail ?? null });
    throw err;
  }
}

async function buildFromPlan(
  { site, business, design, plan, brief = null, feedback = null, previousHome = null, priorUsage = [] },
  onEvent,
) {
  const { pages: rendered, usage, shellReused } = await renderSite(
    { business, design, plan, brief, feedback, previousHome },
    onEvent,
  );

  if (rendered.length === 0) throw new HttpError(502, "No pages were produced");

  // Stage 5. Deterministic, so it runs on every build including a rebuild.
  onEvent({ type: "stage", stage: "seo" });
  const seo = buildSeo({ business, plan, brief });
  const pages = applySeoToPages(rendered, { business, seo });
  onEvent({ type: "seo", seo: { pages: seo.pages, schemaType: seo.jsonLd["@type"], note: seo.note } });

  // Stage 6. Runs before the files are written, so a hard fail is on the
  // record attached to the same version the operator is looking at.
  onEvent({ type: "stage", stage: "qa" });
  const qa = runQa({ business, plan, brief, seo, pages });
  onEvent({ type: "qa", qa });

  const { dir, bytes, index } = writePages(site, pages);

  const sum = (key) => priorUsage.reduce((n, u) => n + (u?.[key] ?? 0), 0);

  updateSite(site.id, {
    dir_path: dir,
    html_path: index,
    pages_json: JSON.stringify(pageSummary(pages)),
    seo_json: JSON.stringify(seo),
    qa_json: JSON.stringify(qa),
    bytes,
    input_tokens: sum("input") + usage.input,
    output_tokens: sum("output") + usage.output,
    cache_read_tokens: sum("cacheRead") + usage.cacheRead,
    status: "ready",
    error: shellReused ? null : "Pages were generated individually; check them for styling drift.",
  });

  const finished = getSite(site.id);
  onEvent({ type: "done", site: finished, pages: pageSummary(pages), qa });
  return finished;
}
