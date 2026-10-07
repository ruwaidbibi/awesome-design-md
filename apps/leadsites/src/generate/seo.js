/**
 * Stage 5 - SEO application. No model call.
 *
 * Everything here is mechanical, which is the argument for doing it in code:
 * titles have a pixel budget, meta descriptions have a character budget,
 * JSON-LD has a schema, and a model asked for "an SEO title" writes seventy-
 * eight characters of adjectives. The facts are already in the database.
 *
 * It runs after render and rewrites the <head>, so re-running it on an already
 * processed page is safe - the block it owns is fenced and replaced wholesale.
 */
import { localBusinessJsonLd, metaFor } from "../research/localseo.js";

const OPEN = "<!-- leadsites:seo -->";
const CLOSE = "<!-- /leadsites:seo -->";

const escapeAttr = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const absolute = (siteUrl, file) =>
  siteUrl ? `${String(siteUrl).replace(/\/+$/, "")}/${file === "index.html" ? "" : file}` : null;

/**
 * Per-page titles, descriptions and the one JSON-LD node.
 *
 * The LocalBusiness node goes on the home page only. Repeating it on every page
 * is a common generator mistake: it does not help, and conflicting copies of
 * the same entity are a structured-data error.
 */
export function buildSeo({ business, plan, brief = null, siteUrl = null }) {
  const pages = (plan.pages ?? []).map((page) => {
    const file = page.slug === "index" ? "index.html" : `${page.slug}.html`;
    const meta = metaFor({ business, page, tagline: brief?.voice?.tagline ?? plan.tagline });
    return {
      slug: page.slug,
      file,
      ...meta,
      canonical: absolute(siteUrl, file),
    };
  });

  return {
    siteUrl: siteUrl ?? null,
    pages,
    jsonLd: localBusinessJsonLd(business, { siteUrl, pages }),
    // Only generatable once the deployment URL is known, so publish calls these.
    sitemapReady: Boolean(siteUrl),
    note: siteUrl
      ? null
      : "No deployment URL yet, so canonical, Open Graph and sitemap are omitted. They are written at publish time.",
  };
}

/** The head block this stage owns. Replaced, never appended to. */
function headBlock({ page, jsonLd, business }) {
  const tags = [
    `<meta name="description" content="${escapeAttr(page.description)}">`,
    page.canonical ? `<link rel="canonical" href="${escapeAttr(page.canonical)}">` : null,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeAttr(page.title)}">`,
    `<meta property="og:description" content="${escapeAttr(page.description)}">`,
    page.canonical ? `<meta property="og:url" content="${escapeAttr(page.canonical)}">` : null,
    `<meta property="og:locale" content="en_US">`,
    `<meta name="twitter:card" content="summary">`,
    business.phone ? `<meta name="format-detection" content="telephone=yes">` : null,
    jsonLd ? `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>` : null,
  ].filter(Boolean);

  return `${OPEN}\n${tags.join("\n")}\n${CLOSE}`;
}

/**
 * Put the SEO block into one page's <head> and set its <title>.
 *
 * The renderer wrote a title from the plan; this one is length-clamped and
 * built to a template, so it wins. Everything else the model put in the head is
 * left alone.
 */
export function applySeo(html, { business, page, jsonLd = null }) {
  let out = html;

  // Idempotent: drop any block we wrote before, including from an older run.
  out = out.replace(new RegExp(`${OPEN}[\\s\\S]*?${CLOSE}\\n?`, "g"), "");
  // A description the model wrote itself would otherwise duplicate ours.
  out = out.replace(/\s*<meta[^>]+name=["']description["'][^>]*>/gi, "");
  out = out.replace(/\s*<link[^>]+rel=["']canonical["'][^>]*>/gi, "");

  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeAttr(page.title)}</title>`);
  }

  const block = headBlock({ page, jsonLd, business });
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${block}\n</head>`);
  } else {
    // No head at all is a renderer failure elsewhere; still better to carry the
    // block than to silently drop it.
    out = `${block}\n${out}`;
  }
  return out;
}

/** Apply stage 5 across a rendered site. */
export function applySeoToPages(pages, { business, seo }) {
  return pages.map((rendered) => {
    const page = seo.pages.find((p) => p.slug === rendered.slug);
    if (!page) return rendered;
    return {
      ...rendered,
      title: page.title,
      html: applySeo(rendered.html, {
        business,
        page,
        jsonLd: rendered.slug === "index" ? seo.jsonLd : null,
      }),
    };
  });
}

export function sitemapXml(siteUrl, pages, { lastmod = new Date().toISOString().slice(0, 10) } = {}) {
  const base = String(siteUrl).replace(/\/+$/, "");
  const urls = pages
    .map((p) => {
      const loc = `${base}/${p.file === "index.html" ? "" : p.file}`;
      return `  <url>\n    <loc>${escapeAttr(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${p.file === "index.html" ? "1.0" : "0.7"}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export const robotsTxt = (siteUrl) =>
  `User-agent: *\nAllow: /\nSitemap: ${String(siteUrl).replace(/\/+$/, "")}/sitemap.xml\n`;
