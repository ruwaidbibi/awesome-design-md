import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { config, hasGenKey } from "./config.js";
import {
  getBusiness,
  getSite,
  listBusinesses,
  listSearches,
  listSites,
  updateBusiness,
  updateSite,
} from "./db.js";
import { CATEGORIES, CITIES, METRO } from "./geo.js";
import { listDesigns } from "./generate/designs.js";
import { generateSite, rebuildSite } from "./generate/generator.js";
import { buildBrief } from "./generate/brief.js";
import { importSite } from "./generate/importer.js";
import { validatePlan, weakSections } from "./generate/schema.js";
import { analyzePhotos } from "./generate/vision.js";
import {
  createRouter,
  HttpError,
  openSse,
  readJsonBody,
  sendJson,
  sendText,
  serveStatic,
} from "./http.js";
import { contentContext, DETAILS_TTL_DAYS, fetchDetails } from "./pipeline/content.js";
import { addByName, enrichBusiness, runProspect } from "./pipeline/prospect.js";
import { listTargets, publishSite } from "./publish.js";

const publicDir = path.join(config.appRoot, "public");
const router = createRouter();

const hydrate = (b) => ({
  ...b,
  types: JSON.parse(b.types_json ?? "[]"),
  hours: JSON.parse(b.hours_json ?? "null"),
  socials: JSON.parse(b.socials_json ?? "null"),
  vision: JSON.parse(b.vision_json ?? "null"),
  score_breakdown: JSON.parse(b.score_breakdown ?? "null"),
  content: contentContext(b),
});

/* --------------------------------- meta ---------------------------------- */

router.get("/api/meta", (req, res) => {
  sendJson(res, 200, {
    provider: config.places.provider,
    placesKeyPresent: Boolean(config.places.apiKey),
    generationReady: hasGenKey(),
    model: config.gen.model,
    effort: config.gen.effort,
    maxPages: config.places.maxPages,
    socialSearchProvider: config.social.braveKey ? "brave" : config.social.serpApiKey ? "serpapi" : null,
    socialGuess: config.social.guess,
    photoVision: config.gen.photoVision,
    metro: { id: METRO.id, label: METRO.label, bounds: METRO.bounds },
    cities: CITIES,
    categories: CATEGORIES,
    detailsTtlDays: DETAILS_TTL_DAYS,
    designs: listDesigns(),
    publishTargets: listTargets(),
    searches: listSearches(),
  });
});

/* ------------------------------ prospecting ------------------------------ */

router.get("/api/prospect/stream", async (req, res, params, url) => {
  const query = url.searchParams.get("query");
  if (!query) throw new HttpError(400, "query is required");

  const sse = openSse(res);
  try {
    const result = await runProspect(
      {
        query,
        city: url.searchParams.get("city") || null,
        minReviews: Number(url.searchParams.get("minReviews") ?? 200),
        includeLiveSites: url.searchParams.get("includeLiveSites") === "true",
      },
      (event) => sse.send("progress", event),
    );
    sse.send("result", { ...result, leads: result.leads.map(hydrate) });
  } catch (err) {
    sse.send("error", { message: err.message, detail: err.detail ?? null });
  } finally {
    sse.close();
  }
});

router.post("/api/lookup", async (req, res) => {
  const body = await readJsonBody(req);
  const query = String(body.query ?? "").trim();
  if (!query) throw new HttpError(400, "query is required");
  const result = await addByName({ query, limit: Math.min(Number(body.limit ?? 3), 5) });
  sendJson(res, 200, { ...result, matches: result.matches.map(hydrate) });
});

router.get("/api/businesses", (req, res, params, url) => {
  const rows = listBusinesses({
    status: url.searchParams.get("status") || undefined,
    websiteStatus: url.searchParams.get("websiteStatus") || undefined,
    minReviews: url.searchParams.has("minReviews") ? Number(url.searchParams.get("minReviews")) : undefined,
    searchId: url.searchParams.has("searchId") ? Number(url.searchParams.get("searchId")) : undefined,
  });
  sendJson(res, 200, { businesses: rows.map(hydrate) });
});

const hydrateSite = (site) => ({
  ...site,
  pages: JSON.parse(site.pages_json ?? "[]"),
  plan: JSON.parse(site.plan_json ?? "null"),
  weak: site.plan_json ? weakSections(JSON.parse(site.plan_json)) : [],
});

router.get("/api/businesses/:id", (req, res, { id }) => {
  const business = getBusiness(id);
  if (!business) throw new HttpError(404, "No such business");
  sendJson(res, 200, { business: hydrate(business), sites: listSites(id).map(hydrateSite) });
});

router.patch("/api/businesses/:id", async (req, res, { id }) => {
  if (!getBusiness(id)) throw new HttpError(404, "No such business");
  const body = await readJsonBody(req);
  const patch = {};
  if (body.status) {
    const allowed = ["new", "shortlisted", "rejected"];
    if (!allowed.includes(body.status)) throw new HttpError(400, `status must be one of ${allowed.join(", ")}`);
    patch.status = body.status;
  }
  if ("notes" in body) patch.notes = String(body.notes ?? "").slice(0, 4000);
  updateBusiness(id, patch);
  sendJson(res, 200, { business: hydrate(getBusiness(id)) });
});

router.post("/api/businesses/:id/details", async (req, res, { id }) => {
  if (!getBusiness(id)) throw new HttpError(404, "No such business");
  const body = await readJsonBody(req);
  const { business, billedRequests, cached } = await fetchDetails(id, { force: Boolean(body.force) });
  sendJson(res, 200, { business: hydrate(business), billedRequests, cached });
});

router.get("/api/businesses/:id/brief", (req, res, { id }, url) => {
  const business = getBusiness(id);
  if (!business) throw new HttpError(404, "No such business");
  const designKey = url.searchParams.get("design");
  if (!designKey) throw new HttpError(400, "design is required");
  const brief = buildBrief({
    business,
    designKey,
    includeDesign: url.searchParams.get("design_md") !== "false",
  });
  res.writeHead(200, {
    "content-type": "text/markdown; charset=utf-8",
    "content-disposition": `attachment; filename="brief-${id}-${designKey}.md"`,
    "cache-control": "no-store",
  });
  res.end(brief);
});

router.post("/api/sites/import", async (req, res) => {
  const body = await readJsonBody(req, 8_000_000);
  const site = importSite({
    businessId: body.businessId,
    designKey: body.designKey,
    plan: body.plan,
    pages: body.pages ?? [],
    model: body.model ?? "external",
  });
  sendJson(res, 200, { site: hydrateSite(site) });
});

router.post("/api/businesses/:id/photos", async (req, res, { id }) => {
  const business = getBusiness(id);
  if (!business) throw new HttpError(404, "No such business");
  const { vision, billedRequests } = await analyzePhotos(business);
  updateBusiness(id, { vision_json: JSON.stringify(vision) });
  sendJson(res, 200, { business: hydrate(getBusiness(id)), billedRequests });
});

router.post("/api/businesses/:id/revalidate", async (req, res, { id }) => {
  if (!getBusiness(id)) throw new HttpError(404, "No such business");
  sendJson(res, 200, { business: hydrate(await enrichBusiness(id)) });
});

/* ------------------------------ generation ------------------------------- */

/**
 * Forward a generation event to the browser, coalescing token deltas.
 *
 * The UI wants to see progress, not every chunk, and an SSE frame per token
 * would cost more than the generation. State is kept per-channel on the sse
 * object so concurrent generations cannot interleave each other's buffers.
 */
function streamEvent(sse, event) {
  const buffer = (sse._pump ??= { pending: "", lastFlush: 0 });

  if (event.type === "delta") {
    buffer.pending += event.text;
    if (Date.now() - buffer.lastFlush > 400) {
      sse.send("progress", { type: "delta", bytes: event.bytes, chunk: buffer.pending });
      buffer.pending = "";
      buffer.lastFlush = Date.now();
    }
    return;
  }

  if (buffer.pending) {
    sse.send("progress", { type: "delta", chunk: buffer.pending });
    buffer.pending = "";
  }
  sse.send(event.type === "done" ? "result" : "progress", event);
}

router.get("/api/businesses/:id/generate/stream", async (req, res, { id }, url) => {
  const business = getBusiness(id);
  if (!business) throw new HttpError(404, "No such business");

  const designKey = url.searchParams.get("design");
  if (!designKey) throw new HttpError(400, "design is required");

  const feedback = url.searchParams.get("feedback") || null;
  const previousSiteId = url.searchParams.has("previousSiteId")
    ? Number(url.searchParams.get("previousSiteId"))
    : null;

  const sse = openSse(res);
  try {
    await generateSite({ business, designKey, feedback, previousSiteId }, (event) => streamEvent(sse, event));
  } catch (err) {
    sse.send("error", { message: err.message, detail: err.detail ?? null });
  } finally {
    sse.close();
  }
});

router.get("/api/sites/:id", (req, res, { id }) => {
  const site = getSite(Number(id));
  if (!site) throw new HttpError(404, "No such site");
  sendJson(res, 200, { site: hydrateSite(site) });
});

router.patch("/api/sites/:id/plan", async (req, res, { id }) => {
  const site = getSite(Number(id));
  if (!site) throw new HttpError(404, "No such site");
  const body = await readJsonBody(req);
  const problems = validatePlan(body.plan);
  if (problems.length > 0) throw new HttpError(400, `Plan is not usable: ${problems.join("; ")}`);
  updateSite(site.id, { plan_json: JSON.stringify(body.plan) });
  sendJson(res, 200, { site: hydrateSite(getSite(site.id)) });
});

router.get("/api/sites/:id/rebuild/stream", async (req, res, { id }) => {
  const site = getSite(Number(id));
  if (!site) throw new HttpError(404, "No such site");
  const business = getBusiness(site.business_id);
  const sse = openSse(res);
  try {
    await rebuildSite({ site, business }, (event) => streamEvent(sse, event));
  } catch (err) {
    sse.send("error", { message: err.message, detail: err.detail ?? null });
  } finally {
    sse.close();
  }
});

// Generated pages are self-contained by construction; the CSP makes it a rule,
// so a page that reaches for an external asset breaks loudly instead of working.
const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'";

function previewFile(site, file) {
  if (!site?.dir_path) throw new HttpError(404, "No generated files");
  const name = file && file !== "/" ? file.replace(/^\/+/, "") : "index.html";
  if (!/^[a-z0-9][a-z0-9-]*\.html$/i.test(name)) throw new HttpError(400, "Not a page of this site");
  const target = path.resolve(site.dir_path, name);
  if (!target.startsWith(path.resolve(site.dir_path) + path.sep)) throw new HttpError(403, "Forbidden");
  if (!fs.existsSync(target)) throw new HttpError(404, `No such page: ${name}`);
  return target;
}

const sendPreview = (res, target) => {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": PREVIEW_CSP,
  });
  res.end(fs.readFileSync(target));
};

router.get("/preview/:id", (req, res, { id }) => {
  sendPreview(res, previewFile(getSite(Number(id)), "index.html"));
});

router.get("/preview/:id/:file", (req, res, { id, file }) => {
  sendPreview(res, previewFile(getSite(Number(id)), file));
});

router.get("/api/sites/:id/source", (req, res, { id }, url) => {
  const target = previewFile(getSite(Number(id)), url.searchParams.get("file") ?? "index.html");
  sendText(res, 200, fs.readFileSync(target, "utf8"));
});

/* ------------------------------- publishing ------------------------------ */

router.post("/api/sites/:id/publish", async (req, res, { id }) => {
  const site = getSite(Number(id));
  if (!site) throw new HttpError(404, "No such site");
  const business = getBusiness(site.business_id);
  const body = await readJsonBody(req);
  const result = await publishSite({ business, site, target: body.target ?? "local" });
  updateBusiness(business.id, { status: "shortlisted" });
  sendJson(res, 200, { ...result, site: getSite(site.id) });
});

/* --------------------------------- serve --------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    const match = router.match(req.method, pathname);
    if (match) {
      await match.handler(req, res, match.params, url);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/published/")) {
      if (serveStatic(res, config.publishedDir, pathname.slice("/published".length))) return;
    }

    if (req.method === "GET" && serveStatic(res, publicDir, pathname === "/" ? "/index.html" : pathname)) {
      return;
    }

    sendJson(res, 404, { error: "Not found", path: pathname });
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error(`${req.method} ${pathname} ->`, err);
    sendJson(res, status, { error: err.message, detail: err.detail ?? null });
  }
});

server.listen(config.port, () => {
  console.log(`leadsites listening on http://localhost:${config.port}`);
  console.log(`  places provider : ${config.places.provider}${config.places.apiKey ? "" : " (no GOOGLE_MAPS_API_KEY set)"}`);
  console.log(`  generation      : ${hasGenKey() ? `ready (${config.gen.model}, effort ${config.gen.effort})` : "disabled (no ANTHROPIC_API_KEY set)"}`);
  console.log(`  design systems  : ${listDesigns().length} found in ${config.designDir}`);
  console.log(`  scope           : ${METRO.label} (${CITIES.length} cities)`);
});
