import { readDesign } from "./designs.js";
import { buildEvidence, evidenceText } from "./evidence.js";
import { PLANNER_SYSTEM } from "./planner.js";
import { RENDERER_SYSTEM } from "./renderer.js";
import { CONTENT_PLAN_SCHEMA } from "./schema.js";

/**
 * Everything the built-in generator would have sent to the model, as one
 * self-contained document.
 *
 * This exists so the generation half can be done by hand - in a Claude session,
 * in the console, anywhere - without an ANTHROPIC_API_KEY configured here. What
 * comes back can be fed to `npm run import`, and the result is indistinguishable
 * from a site this app generated itself.
 */
export function buildBrief({ business, designKey, includeDesign = true }) {
  const design = readDesign(designKey);
  const evidence = buildEvidence(business);

  const parts = [];

  parts.push(`# Build a website for ${business.name}

Two stages. Produce the content plan first, then the pages. Everything you are
allowed to know is in this document; nothing else about this business is true.

- Business: ${business.name}
- Category: ${business.primary_type?.replace(/_/g, " ") ?? "unknown"}
- Design system: ${designKey}
- Place id: ${business.id}

When you are done, save the results like this and run the import:

    <dir>/plan.json      the content plan
    <dir>/index.html     the home page
    <dir>/<slug>.html    one file per other page in the plan

    npm run import -- ${business.id} --design ${designKey} --dir <dir>
`);

  parts.push(`## Stage 1 instructions (the planner)

${PLANNER_SYSTEM}`);

  parts.push(`## The plan's required shape

Return JSON matching this schema exactly, as \`plan.json\`:

\`\`\`json
${JSON.stringify(CONTENT_PLAN_SCHEMA, null, 2)}
\`\`\``);

  parts.push(`## Stage 2 instructions (the renderer)

${RENDERER_SYSTEM}

### How the pages fit together

Write the home page as a complete HTML document, including a shared header with
navigation and a shared footer. Write every other page as a complete document
too, reusing that page's stylesheet, header and footer verbatim so the site is
visually identical page to page.

Navigation hrefs are the page slugs: \`index.html\`, \`services.html\`, and so on.
Mark the current page with \`aria-current="page"\` on its own nav link.`);

  parts.push(`## The evidence

${evidenceText(evidence)}`);

  if (includeDesign) {
    parts.push(`## The DESIGN.md to follow

${design.markdown}`);
  } else {
    parts.push(`## The DESIGN.md to follow

Read it from \`design-md/${designKey}/DESIGN.md\` in this repository.`);
  }

  return parts.join("\n\n---\n\n") + "\n";
}
