import { BRIEF_SYSTEM } from "./creative-brief.js";
import { listDesigns, readDesign } from "./designs.js";
import { buildEvidence, evidenceText } from "./evidence.js";
import { PLANNER_SYSTEM } from "./planner.js";
import { RENDERER_SYSTEM } from "./renderer.js";
import { CONTENT_PLAN_SCHEMA, CREATIVE_BRIEF_SCHEMA } from "./schema.js";

/**
 * Everything the built-in generator would have sent to the model, as one
 * self-contained document.
 *
 * This exists so the generation half can be done by hand - in a Claude session,
 * in the console, anywhere - without an ANTHROPIC_API_KEY configured here. What
 * comes back can be fed to `npm run import`, and the result is
 * indistinguishable from a site this app generated itself.
 *
 * It carries the same three model-call stages in the same order with the same
 * system prompts, which is the whole point: the two paths cannot drift, because
 * there is one source for the prompts and this file quotes it.
 *
 * Research, SEO and QA are deliberately not here as instructions. They are
 * code, not prompts - `research` is passed in already computed, and stages 5
 * and 6 run on import.
 */
export function buildHandoff({ business, research = null, designKey = null, includeDesign = true }) {
  const design = designKey ? readDesign(designKey) : null;
  const evidence = buildEvidence(business);
  const parts = [];

  parts.push(`# Build a website for ${business.name}

Three stages. The brief decides the strategy and the art direction, the plan
decides what each section says and on what evidence, then the pages get built.
Everything you are allowed to know is in this document; nothing else about this
business is true.

- Business: ${business.name}
- Category: ${business.primary_type?.replace(/_/g, " ") ?? "unknown"}
- Design system: ${designKey ?? "**your choice** - stage 1 picks it from the catalogue below"}
- Place id: ${business.id}

When you are done, save the results like this and run the import:

    <dir>/brief.json     the creative brief
    <dir>/plan.json      the content plan
    <dir>/index.html     the home page
    <dir>/<slug>.html    one file per other page in the plan

    npm run import -- ${business.id} --dir <dir>${designKey ? ` --design ${designKey}` : ""}

The import re-runs the deterministic stages for you: it applies the SEO head
block and JSON-LD, then runs the QA gates and refuses to mark the site
publishable if a hard gate fails.
`);

  if (research) {
    parts.push(`## The research (already done, stage 1)

This is computed from data already held, not from a model. Treat every number
as a fact and anything absent as unknown.

### Competitive set

\`\`\`json
${JSON.stringify(research.competitors, null, 2)}
\`\`\`

### What the local rivals' sites look like

\`\`\`json
${JSON.stringify(research.rivals, null, 2)}
\`\`\`

### Brand signals

\`\`\`json
${JSON.stringify(research.brand, null, 2)}
\`\`\`

### Local search

\`\`\`json
${JSON.stringify({ ...research.localSeo, gbp: undefined }, null, 2)}
\`\`\``);
  }

  parts.push(`## Stage 2 instructions (the brief)

${BRIEF_SYSTEM}`);

  if (!designKey) {
    const designs = listDesigns();
    parts.push(`### The design systems to choose from (${designs.length})

Each lives at \`design-md/<key>/DESIGN.md\` in this repository. Choose one key,
then read that file before stage 4.

${designs.map((d) => `- \`${d.key}\` — ${d.label}${d.primary ? ` (primary ${d.primary})` : ""}: ${d.description || "no description"}`).join("\n")}`);
  }

  parts.push(`### The brief's required shape

Return JSON matching this schema exactly, as \`brief.json\`:

\`\`\`json
${JSON.stringify(CREATIVE_BRIEF_SCHEMA, null, 2)}
\`\`\``);

  parts.push(`## Stage 3 instructions (the planner)

${PLANNER_SYSTEM}`);

  parts.push(`### The plan's required shape

Return JSON matching this schema exactly, as \`plan.json\`:

\`\`\`json
${JSON.stringify(CONTENT_PLAN_SCHEMA, null, 2)}
\`\`\``);

  parts.push(`## Stage 4 instructions (the renderer)

${RENDERER_SYSTEM}

### How the pages fit together

Write the home page as a complete HTML document, including a shared header with
navigation and a shared footer. Write every other page as a complete document
too, reusing that page's stylesheet, header and footer verbatim so the site is
visually identical page to page.

Navigation hrefs are the page slugs: \`index.html\`, \`services.html\`, and so on.
Mark the current page with \`aria-current="page"\` on its own nav link.

Do not write a \`<title>\`, meta description, canonical tag or JSON-LD yourself.
Stage 5 writes all of those from the facts, to a length budget, and will
overwrite whatever is there.`);

  parts.push(`## The evidence

${evidenceText(evidence)}`);

  if (design && includeDesign) {
    parts.push(`## The DESIGN.md to follow

${design.markdown}`);
  } else if (design) {
    parts.push(`## The DESIGN.md to follow

Read it from \`design-md/${designKey}/DESIGN.md\` in this repository.`);
  }

  return parts.join("\n\n---\n\n") + "\n";
}
