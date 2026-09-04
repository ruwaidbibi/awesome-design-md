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
} from "./db.js";
import { listDesigns } from "./generate/designs.js";
import { generateSite } from "./generate/generator.js";
import {
  createRouter,
  HttpError,
  openSse,
  readJsonBody,
  sendJson,
  sendText,
  serveStatic,
} from "./http.js";
import { enrichBusiness, runProspect } from "./pipeline/prospect.js";
import { listTargets, publishSite } from "./publish.js";

const publicDir = path.join(config.appRoot, "public");
const router = createRouter();

const hydrate = (b) => ({
  ...b,
  types: JSON.parse(b.types_json ?? "[]"),
  hours: JSON.parse(b.hours_json ?? "null"),
  socials: JSON.parse(b.socials_json ?? "null"),
  score_breakdown: JSON.parse(b.score_breakdown ?? "null"),
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
        location: url.searchParams.get("location") || null,
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

router.get("/api/businesses", (req, res, params, url) => {
  const rows = listBusinesses({
    status: url.searchParams.get("status") || undefined,
    websiteStatus: url.searchParams.get("websiteStatus") || undefined,
    minReviews: url.searchParams.has("minReviews") ? Number(url.searchParams.get("minReviews")) : undefined,
    searchId: url.searchParams.has("searchId") ? Number(url.searchParams.get("searchId")) : undefined,
  });
  sendJson(res, 200, { businesses: rows.map(hydrate) });
});

router.get("/api/businesses/:id", (req, res, { id }) => {
  const business = getBusiness(id);
  if (!business) throw new HttpError(404, "No such business");
  sendJson(res, 200, { business: hydrate(business), sites: listSites(id) });
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

router.post("/api/businesses/:id/revalidate", async (req, res, { id }) => {
  if (!getBusiness(id)) throw new HttpError(404, "No such business");
  sendJson(res, 200, { business: hydrate(await enrichBusiness(id)) });
});

/* ------------------------------ generation ------------------------------- */

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
  let pending = "";
  let lastFlush = 0;
  try {
    await generateSite({ business, designKey, feedback, previousSiteId }, (event) => {
      if (event.type === "delta") {
        // Coalesce token deltas: the browser wants progress, not every chunk.
        pending += event.text;
        const elapsed = Date.now() - lastFlush;
        if (elapsed > 400) {
          sse.send("progress", { type: "delta", bytes: event.bytes, chunk: pending });
          pending = "";
          lastFlush = Date.now();
        }
        return;
      }
      if (pending) {
        sse.send("progress", { type: "delta", chunk: pending });
        pending = "";
      }
      sse.send(event.type === "done" ? "result" : "progress", event);
    });
  } catch (err) {
    sse.send("error", { message: err.message, detail: err.detail ?? null });
  } finally {
    sse.close();
  }
});

router.get("/api/sites/:id", (req, res, { id }) => {
  const site = getSite(Number(id));
  if (!site) throw new HttpError(404, "No such site");
  sendJson(res, 200, { site });
});

router.get("/preview/:id", (req, res, { id }) => {
  const site = getSite(Number(id));
  if (!site?.html_path || !fs.existsSync(site.html_path)) throw new HttpError(404, "No generated file");
  const html = fs.readFileSync(site.html_path, "utf8");
  // Generated pages are self-contained by construction; the CSP makes that a rule.
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'",
  });
  res.end(html);
});

router.get("/api/sites/:id/source", (req, res, { id }) => {
  const site = getSite(Number(id));
  if (!site?.html_path || !fs.existsSync(site.html_path)) throw new HttpError(404, "No generated file");
  sendText(res, 200, fs.readFileSync(site.html_path, "utf8"));
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
  console.log(`sitesmith listening on http://localhost:${config.port}`);
  console.log(`  places provider : ${config.places.provider}${config.places.apiKey ? "" : " (no GOOGLE_MAPS_API_KEY set)"}`);
  console.log(`  generation      : ${hasGenKey() ? `ready (${config.gen.model}, effort ${config.gen.effort})` : "disabled (no ANTHROPIC_API_KEY set)"}`);
  console.log(`  design systems  : ${listDesigns().length} found in ${config.designDir}`);
});
