import * as cheerio from "cheerio";

/**
 * Strips a page down to the text an extractor actually needs. Keeps link hrefs
 * inline because parish directories put the parish website behind the name,
 * and that link is often the single most valuable field on the page.
 */
export function htmlToText(html: string, baseUrl: string, maxChars = 60_000): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, header, footer, form").remove();

  $("a[href]").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    const text = $el.text().trim();
    if (!href || !text) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      // Set via .text() so the angle brackets are escaped in the DOM and
      // survive as literal characters; replaceWith() would parse "<https://..>"
      // as a tag and drop it.
      if (/^https?:/.test(abs)) $el.replaceWith($("<span></span>").text(`${text} <${abs}> `));
    } catch {
      /* leave unparseable hrefs as plain text */
    }
  });

  // <br> and block ends carry the line structure that addresses depend on.
  $("br").replaceWith("\n");
  $("p, div, li, tr, h1, h2, h3, h4, h5, h6, td").append("\n");

  const text = $("body").text().replace(/[ \t ]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated]` : text;
}
