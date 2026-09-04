import { config } from "../config.js";
import { HttpError } from "../http.js";
import { genConfig, send, textOf, usageOf } from "./client.js";
import { buildEvidence, evidenceText, TRUTH_RULES } from "./evidence.js";
import { CONTENT_PLAN_SCHEMA, validatePlan } from "./schema.js";

const SYSTEM = `You plan small marketing websites for local businesses, from evidence.

You are given what is actually known about one real business: verified facts from Google, what its customers say in reviews, sometimes what its photos show, and sometimes notes from the person running this tool. You return a content plan: which pages the site should have, what each section says, and - for every section - which piece of evidence entitles you to say it.

${TRUTH_RULES}

## Choosing pages

Let the evidence decide, not a template. A business with five reviews naming distinct services earns a services page; one with no review text does not. Rules:

- There is always an "index" page.
- Add a page only when you have enough evidence to fill it. Two strong pages beat five thin ones.
- Never exceed five pages.
- A page every local business can support is hours, address, phone and directions. Call it "visit" unless a better name fits.
- Do not plan a menu, price list, team, or testimonials page. You do not have that information and must not invent it.

## Recording evidence

Every section carries an evidence array. Be precise and honest about strength:

- "google-fact" for anything in the verified facts.
- "review" with ref "review 3" for something customers actually said.
- "operator-notes" for what the operator supplied.
- "photo" for what the photo analysis showed.
- "category-norm" for a safe generality about this kind of business that nothing specific supports. Use it honestly and often - it is not a failure, it is the label for filler.

A section whose evidence is entirely "category-norm" must be marked confidence "low". If you cannot get a page above mostly-low confidence, do not plan that page.

## Copy

Write the actual words, not descriptions of words. Body copy should be a few short sentences, in the voice the evidence supports. Where the owner has to supply something, say so in that section's placeholders and in ownerTodos rather than writing a plausible-sounding guess.

In claimsAvoided, list what a careless generator would have written here and you did not, and why nothing supported it. Be specific.`;

/**
 * Plan the site before building it.
 *
 * Separating this from rendering is what makes the result auditable: the plan is
 * small enough for a human to read, every section says what it rests on, and
 * anything unearned can be removed before a line of HTML exists.
 */
export async function planSite({ business, design }, onEvent = () => {}) {
  const evidence = buildEvidence(business);

  const message = await send(
    {
      model: genConfig().model,
      max_tokens: 32000,
      system: SYSTEM,
      thinking: { type: "adaptive", display: "summarized" },
      output_config: {
        effort: genConfig().effort,
        format: { type: "json_schema", schema: CONTENT_PLAN_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            // Stable prefix, cached: the same DESIGN.md is re-sent by every
            // render call that follows this plan.
            {
              type: "text",
              text: "# The design system this site will be built in\n\n" + design.markdown,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text:
                evidenceText(evidence) +
                `\n\n---\n\nPlan the website for ${business.name}. Return the content plan.`,
            },
          ],
        },
      ],
    },
    onEvent,
  );

  let plan;
  try {
    plan = JSON.parse(textOf(message));
  } catch (err) {
    throw new HttpError(502, "The planner did not return usable JSON", { detail: err.message });
  }

  const problems = validatePlan(plan);
  if (problems.length > 0) {
    throw new HttpError(502, `The plan is not usable: ${problems.join("; ")}`);
  }

  // index first, then plan order: nav and rendering both depend on it.
  plan.pages.sort((a, b) => (a.slug === "index" ? -1 : b.slug === "index" ? 1 : 0));

  return { plan, usage: usageOf(message), model: config.gen.model };
}
