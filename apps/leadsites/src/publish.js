import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { now, updateSite } from "./db.js";
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

export async function publishSite({ business, site, target = "local" }) {
  const impl = targets[target];
  if (!impl) throw new HttpError(400, `Unknown publish target: ${target}`);
  if (!impl.available()) throw new HttpError(400, `Publish target "${target}" is not configured`);
  if (site.status === "failed" || !site.dir_path || !fs.existsSync(site.dir_path)) {
    throw new HttpError(409, "That version has no generated files to publish");
  }

  const summary = JSON.parse(site.pages_json ?? "[]");
  const pages = summary
    .map((page) => ({ ...page, path: path.join(site.dir_path, page.file) }))
    .filter((page) => fs.existsSync(page.path))
    .map((page) => ({ ...page, html: fs.readFileSync(page.path, "utf8") }));

  if (pages.length === 0) throw new HttpError(409, "None of that version's pages are on disk");

  const { url, detail } = await impl.publish({ business, site, pages });

  updateSite(site.id, { status: "published", published_at: now(), published_url: url });
  return { url, target, detail };
}
