import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { now, updateSite } from "./db.js";
import { applySeoToPages, buildSeo, robotsTxt, sitemapXml } from "./generate/seo.js";
import { HttpError } from "./http.js";

export const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "site";

/**
 * A publish target takes a finished HTML file and puts it somewhere a customer
 * could load it, then returns the URL. Adding a hosted target means adding one
 * entry here with the same three members; nothing else in the app changes.
 *
 * Sketch of a Netlify target, for when you want a public URL:
 *   available: () => Boolean(process.env.NETLIFY_AUTH_TOKEN)
 *   publish:   zip {index.html}, POST it to
 *              https://api.netlify.com/api/v1/sites/{siteId}/deploys with
 *              content-type application/zip and a Bearer token, then return
 *              deploy.ssl_url.
 */
export const targets = {
  local: {
    id: "local",
    label: "Local static folder",
    available: () => true,
    describe: () => `Writes the page to ${config.publishedDir} and serves it at /published/.`,
    async publish({ business, site, pages }) {
      const slug = `${slugify(business.name)}-${business.id.slice(-6)}`;
      const dir = path.join(config.publishedDir, slug);
      // Replace wholesale: a republish with fewer pages must not leave the
      // dropped ones live.
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });

      for (const page of pages) {
        fs.writeFileSync(path.join(dir, page.file), page.html, "utf8");
      }
      // Keep a record of exactly what went live, so a republish is auditable.
      fs.writeFileSync(
        path.join(dir, "published.json"),
        JSON.stringify(
          {
            business_id: business.id,
            name: business.name,
            site_id: site.id,
            version: site.version,
            pages: pages.map((p) => p.file),
            published_at: now(),
          },
          null,
          2,
        ),
        "utf8",
      );
      return { url: `/published/${slug}/`, detail: dir };
    },
  },
};

export const listTargets = () =>
  Object.values(targets).map((t) => ({
    id: t.id,
    label: t.label,
    available: t.available(),
    describe: t.describe(),
  }));

/**
 * Publish, gated on QA.
 *
 * The hard gates in `src/generate/qa.js` exist to stop a page that reuses a
 * customer's words, names a reviewer, or states a credential nobody gave us
 * from reaching a real business's customers. Blocking here rather than warning
 * is the point: a warning in a log is not a gate.
 *
 * `force` exists because the operator may know something the gates do not, but
 * it is an explicit decision, and what was overridden is recorded.
 */
export async function publishSite({ business, site, target = "local", force = false }) {
  const impl = targets[target];
  if (!impl) throw new HttpError(400, `Unknown publish target: ${target}`);
  if (!impl.available()) throw new HttpError(400, `Publish target "${target}" is not configured`);
  if (site.status === "failed" || !site.dir_path || !fs.existsSync(site.dir_path)) {
    throw new HttpError(409, "That version has no generated files to publish");
  }

  const qa = JSON.parse(site.qa_json ?? "null");
  if (qa && !qa.publishable && !force) {
    throw new HttpError(409, `QA blocked this version: ${qa.hardFails.map((f) => f.label).join("; ")}`, {
      hardFails: qa.hardFails,
      hint: "Fix the plan and re-render, or publish with force to override deliberately.",
    });
  }

  const summary = JSON.parse(site.pages_json ?? "[]");
  let pages = summary
    .map((page) => ({ ...page, path: path.join(site.dir_path, page.file) }))
    .filter((page) => fs.existsSync(page.path))
    .map((page) => ({ ...page, html: fs.readFileSync(page.path, "utf8") }));

  if (pages.length === 0) throw new HttpError(409, "None of that version's pages are on disk");

  // Canonical, Open Graph and the sitemap all need the real URL, which only
  // exists now. The SEO block is written to be replaced, so re-applying it
  // here is safe and leaves nothing duplicated.
  const plan = JSON.parse(site.plan_json ?? "null");
  const brief = JSON.parse(site.brief_json ?? "null");
  const siteUrl = absoluteUrlFor(business, target);
  let extras = [];
  if (siteUrl && plan) {
    const seo = buildSeo({ business, plan, brief, siteUrl });
    pages = applySeoToPages(pages, { business, seo });
    extras = [
      { file: "sitemap.xml", html: sitemapXml(siteUrl, seo.pages) },
      { file: "robots.txt", html: robotsTxt(siteUrl) },
    ];
  }

  const { url, detail } = await impl.publish({ business, site, pages: [...pages, ...extras] });

  updateSite(site.id, { status: "published", published_at: now(), published_url: url });
  return {
    url,
    target,
    detail,
    forced: Boolean(qa && !qa.publishable && force),
    sitemap: extras.length > 0,
    note: siteUrl ? null : "PUBLIC_BASE_URL is not set, so canonical URLs, Open Graph URLs and the sitemap were omitted.",
  };
}

/**
 * The absolute URL the site will actually be served from.
 *
 * The local target writes into a folder served by this app, so the absolute
 * form only exists if the operator has told us the public origin. Guessing one
 * would put a wrong canonical tag on a real site, which is worse than none.
 */
function absoluteUrlFor(business, target) {
  if (!config.publish.baseUrl) return null;
  if (target !== "local") return null;
  const slug = `${slugify(business.name)}-${business.id.slice(-6)}`;
  return `${config.publish.baseUrl.replace(/\/+$/, "")}/published/${slug}`;
}
