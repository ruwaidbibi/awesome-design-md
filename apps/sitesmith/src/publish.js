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
    async publish({ business, site, html }) {
      const slug = `${slugify(business.name)}-${business.id.slice(-6)}`;
      const dir = path.join(config.publishedDir, slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
      // Keep the exact bytes that went live, so a later republish is auditable.
      fs.writeFileSync(
        path.join(dir, "published.json"),
        JSON.stringify(
          { business_id: business.id, name: business.name, site_id: site.id, version: site.version, published_at: now() },
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
  if (site.status === "failed" || !site.html_path || !fs.existsSync(site.html_path)) {
    throw new HttpError(409, "That version has no generated file to publish");
  }

  const html = fs.readFileSync(site.html_path, "utf8");
  const { url, detail } = await impl.publish({ business, site, html });

  updateSite(site.id, { status: "published", published_at: now(), published_url: url });
  return { url, target, detail };
}
