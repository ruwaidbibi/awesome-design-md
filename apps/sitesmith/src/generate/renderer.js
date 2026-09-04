import { HttpError } from "../http.js";
import { genConfig, send, textOf, usageOf } from "./client.js";
import { buildEvidence, evidenceText, TRUTH_RULES } from "./evidence.js";

const SYSTEM = `You build small, complete marketing websites for local businesses.

You are given a design system (a DESIGN.md), a content plan that has already decided what the site says and why, and the evidence behind it. You write the HTML.

${TRUTH_RULES}

## Follow the plan

The plan is the decision. Write the sections it lists, on the pages it lists, saying what its copy says. Improve the wording; do not add claims it did not make, and do not drop sections it did make. If a section carries placeholders, render them as visible placeholder elements rather than inventing the missing content:

  <span class="sitesmith-todo">[[ADD: two sentences on your story]]</span>
  <div class="sitesmith-photo">[[ADD PHOTO: storefront]]</div>

Give .sitesmith-todo and .sitesmith-photo a dashed outline so unfinished spots are obvious in review.

## Output

- Fully self-contained. All CSS in one <style> block, any JS in one <script> block. No external CSS, JS, fonts, or images of any kind: this is served as a static file with a policy that blocks every outbound request, so an external reference does not degrade, it breaks.
- No <img src> pointing anywhere. Use CSS gradients, CSS shapes, or inline SVG, and leave marked photo slots the owner can fill.
- Responsive from 360px to 1440px. Semantic landmarks (<header>, <nav>, <main>, <footer>), correct heading order, labelled controls, visible focus styles, and text meeting WCAG AA contrast.
- A phone link (<a href="tel:...">) and a Google Maps link wherever a customer would want one.
- A contact form only if it needs no backend: prefer a tel: or mailto: call to action.

## Design fidelity

Use the DESIGN.md as a real design system: its colour tokens, type scale, spacing, radii, and component patterns, adapted to this business's category and tone. Borrow the visual language only. Never copy the source brand's name, logo, wordmark, product names, or marketing copy onto the site, and never imply any affiliation with it.`;

const fileFor = (slug) => (slug === "index" ? "index.html" : `${slug}.html`);

function navSpec(plan) {
  return plan.pages.map((p) => `- ${p.navLabel} -> ${fileFor(p.slug)}`).join("\n");
}

/** Pull the reusable chrome out of the home page so other pages match it exactly. */
export function extractShell(html) {
  const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0]).join("\n");
  const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]).join("\n");
  const header = /<header[\s\S]*?<\/header>/i.exec(html)?.[0] ?? null;
  const footer = /<footer[\s\S]*?<\/footer>/i.exec(html)?.[0] ?? null;
  const lang = /<html[^>]*\slang=["']([^"']+)["']/i.exec(html)?.[1] ?? "en";
  return { styles, scripts, header, footer, lang, complete: Boolean(styles && header && footer) };
}

/** Mark the current page in the nav without re-asking the model for it. */
function markCurrent(headerHtml, file) {
  if (!headerHtml) return headerHtml;
  return headerHtml.replace(
    new RegExp(`href=(["'])${file.replace(".", "\\.")}\\1`, "i"),
    (match) => `${match} aria-current="page"`,
  );
}

function assemble({ shell, page, mainHtml }) {
  const file = fileFor(page.slug);
  return `<!DOCTYPE html>
<html lang="${shell.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
${shell.styles}
</head>
<body>
${markCurrent(shell.header, file)}
${mainHtml}
${shell.footer}
${shell.scripts}
</body>
</html>`;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Pull the HTML document out of the model's reply, tolerating stray fences. */
export function extractHtml(raw) {
  let text = raw.trim();
  const fence = /```(?:html)?\s*\n([\s\S]*?)\n```/i.exec(text);
  if (fence) text = fence[1].trim();
  const start = text.search(/<!DOCTYPE html|<html[\s>]/i);
  if (start > 0) text = text.slice(start);
  const end = text.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) text = text.slice(0, end + "</html>".length);
  return text.trim();
}

/** Pull a <main> fragment out of the model's reply. */
export function extractMain(raw) {
  let text = raw.trim();
  const fence = /```(?:html)?\s*\n([\s\S]*?)\n```/i.exec(text);
  if (fence) text = fence[1].trim();
  const main = /<main[\s\S]*<\/main>/i.exec(text);
  return main ? main[0] : null;
}

/**
 * Build the site.
 *
 * The home page is generated as a complete document and becomes the shell: its
 * stylesheet, header and footer are reused verbatim for every other page, which
 * are generated as <main> fragments and assembled here. That keeps a five-page
 * site visually identical page to page, and keeps each request small enough to
 * be reliable. If the home page comes back in a shape we cannot take apart, the
 * remaining pages fall back to complete documents.
 */
export async function renderSite({ business, design, plan, feedback = null, previousHome = null }, onEvent = () => {}) {
  const evidence = buildEvidence(business);
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const accumulate = (u) => {
    usage.input += u.input; usage.output += u.output;
    usage.cacheRead += u.cacheRead; usage.cacheWrite += u.cacheWrite;
  };

  // The DESIGN.md is identical for every call in this render; cache it once.
  const designBlock = {
    type: "text",
    text: "# DESIGN.md to follow\n\n" + design.markdown,
    cache_control: { type: "ephemeral" },
  };

  const planContext =
    `# The content plan (already decided - follow it)\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`` +
    `\n\n# Site navigation (use these exact hrefs)\n\n${navSpec(plan)}`;

  const home = plan.pages[0];
  onEvent({ type: "page", slug: home.slug, index: 1, total: plan.pages.length });

  const homeParts = [
    designBlock,
    { type: "text", text: `${evidenceText(evidence)}\n\n---\n\n${planContext}` },
  ];
  if (previousHome && feedback) {
    homeParts.push({ type: "text", text: "# The previous version of the home page\n\n```html\n" + previousHome + "\n```" });
    homeParts.push({ type: "text", text: "# Requested changes\n\nApply this feedback across the whole site. Keep everything not mentioned.\n\n" + feedback });
  }
  homeParts.push({
    type: "text",
    text: `Build the "${home.slug}" page for ${business.name} as a complete HTML document, including the shared header with navigation and the shared footer. Return the document only.`,
  });

  const homeMessage = await send(
    {
      model: genConfig().model,
      max_tokens: 64000,
      system: SYSTEM,
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: genConfig().effort },
      messages: [{ role: "user", content: homeParts }],
    },
    onEvent,
  );
  accumulate(usageOf(homeMessage));

  const homeHtml = extractHtml(textOf(homeMessage));
  if (!/<html[\s>]/i.test(homeHtml)) {
    throw new HttpError(502, "The home page did not come back as an HTML document", {
      preview: textOf(homeMessage).slice(0, 400),
    });
  }

  const shell = extractShell(homeHtml);

  // The home page is the model's own document rather than one we assembled, so
  // it needs the same current-page marking the other pages get for free.
  const homeFile = fileFor(home.slug);
  const homeMarked = shell.header
    ? homeHtml.replace(shell.header, markCurrent(shell.header, homeFile))
    : homeHtml;

  const pages = [{ slug: home.slug, file: homeFile, title: home.title, html: homeMarked }];
  if (!shell.complete) {
    onEvent({ type: "note", message: "Could not reuse the home page shell; remaining pages are generated whole." });
  }

  for (const [i, page] of plan.pages.slice(1).entries()) {
    onEvent({ type: "page", slug: page.slug, index: i + 2, total: plan.pages.length });

    const wantsFragment = shell.complete;
    const instruction = wantsFragment
      ? `Build the "${page.slug}" page. Return ONLY its <main> element - no <html>, <head>, <header> or <footer>, because the shared shell below is reused verbatim. Use only classes and custom properties that already exist in that stylesheet.`
      : `Build the "${page.slug}" page as a complete HTML document, matching the home page exactly in styling, header and footer.`;

    const parts = [
      designBlock,
      { type: "text", text: `${evidenceText(evidence)}\n\n---\n\n${planContext}` },
      {
        type: "text",
        text: wantsFragment
          ? `# The shared shell already built for this site\n\n\`\`\`html\n${shell.styles}\n\n${shell.header}\n\n${shell.footer}\n\`\`\``
          : `# The home page, for reference\n\n\`\`\`html\n${homeHtml}\n\`\`\``,
      },
      { type: "text", text: `${instruction}\n\nThis page's plan is the entry with slug "${page.slug}".` },
    ];

    const message = await send(
      {
        model: genConfig().model,
        max_tokens: 32000,
        system: SYSTEM,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: genConfig().effort },
        messages: [{ role: "user", content: parts }],
      },
      onEvent,
    );
    accumulate(usageOf(message));

    const raw = textOf(message);
    let html;
    if (wantsFragment) {
      const main = extractMain(raw);
      if (!main) {
        onEvent({ type: "note", message: `"${page.slug}" did not return a <main>; skipping it.` });
        continue;
      }
      html = assemble({ shell, page, mainHtml: main });
    } else {
      html = extractHtml(raw);
      if (!/<html[\s>]/i.test(html)) {
        onEvent({ type: "note", message: `"${page.slug}" did not return a document; skipping it.` });
        continue;
      }
    }
    pages.push({ slug: page.slug, file: fileFor(page.slug), title: page.title, html });
  }

  return { pages, usage, shellReused: shell.complete };
}
