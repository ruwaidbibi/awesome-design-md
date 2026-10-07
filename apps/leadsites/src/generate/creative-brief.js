/**
 * Stage 2 - the creative brief. One model call.
 *
 * This is the stage the commodity generators skip. They go from "here is a
 * business" straight to "here is a page", which is why their output is
 * interchangeable: nothing ever decided what the site is *for*, who it is
 * *against*, or what it should *feel* like. A brief is the decision, written
 * down, before any copy or HTML exists.
 *
 * It also takes the design-system choice away from the operator. Picking one of
 * seventy-odd systems from a dropdown is input we should not be asking for, and
 * a human picking by vibe is exactly how four local barbershops end up with the
 * same dark-and-gold site. The brief chooses, and has to justify the choice
 * against the rivals it was shown.
 */
import { config } from "../config.js";
import { HttpError } from "../http.js";
import { genConfig, send, textOf, usageOf } from "./client.js";
import { buildEvidence, evidenceText, TRUTH_RULES } from "./evidence.js";
import { listDesigns } from "./designs.js";
import { researchBrand } from "../research/brand.js";
import { researchCompetitors } from "../research/competitors.js";
import { researchLocalSeo } from "../research/localseo.js";
import { CREATIVE_BRIEF_SCHEMA, validateBrief } from "./schema.js";

export const BRIEF_SYSTEM = `You are the strategist and art director on a small agency team, writing the brief for one real local business's website.

You get the research the team has already done: verified facts, what customers say, the competitive set, what the trade's conventions are, and a catalogue of design systems to choose from. You return the brief. Copy and HTML are written by other people, later, from what you decide here.

${TRUTH_RULES}

## The job

A brief is a set of decisions, not a description. Every field should close off an argument that would otherwise happen during production.

**The conversion goal is one action.** Not "contact us" - call, book, visit, quote or order. Choose it from how this category's customers actually decide, not from what is tidiest. Someone whose car will not start is not going to fill in a form. Only choose "book" or "order" if the evidence contains a real place to do it; inventing a booking flow is inventing a fact.

**Positioning needs a claim, its proof, and its parity items.** The parity list is the part people skip and it is the most useful thing in the brief: things true of this business and equally true of every rival. "Experienced barbers", "quality service", "friendly staff" - all true, all worthless in a hero, because the shop next door says them too. Name them so production knows not to lead with them.

**mustNotSay is a real constraint, not a disclaimer.** Put in it: anything unsupported by evidence, anything the reviews actually disagree about, and anything every rival claims. If reviews are split on service quality, "friendly service" belongs in mustNotSay - a promise like that is what an unhappy customer quotes back at you.

## Choosing the design system

You must choose exactly one key from the catalogue, and the rationale is the point. Two tests:

1. **Fit.** Does the register match the business? A faith-referencing barber parlour and a self-described express cut-and-go are not the same brand and must not get the same system.
2. **Differentiation.** You were shown what the local rivals look like. If most of them share a palette or a type register, taking it too makes this business invisible in the one place it is compared - a phone screen showing three tabs. Say in the rationale what the rivals look like and how this choice differs.

If no competitive set was available, say that plainly in the rationale. Do not imply research you were not given.

Only set paletteOverride when a colour was actually observed at the premises, or when the chosen system's palette collides with the local norm. Each override states why.

No generated logo. For a business at this budget an AI mark is worse than their own name well set, so wordmark is a typographic treatment from the system you chose.

**There are no real photographs available to this site.** Google's terms do not allow a place photo to be republished, and we will not fabricate an interior of a real business that a customer can walk into. imageStrategy decides what carries the page instead.

## Navigation

Derive the pages from the conversion goal. Every page has to answer "what does this do for the goal"; if it cannot, do not include it. Five pages maximum, and two strong pages beat five thin ones. There is always an "index".

Do not plan a menu, price list, team or testimonials page - we have none of that information and must not invent it. If rival sites all have one, that belongs in tableStakes as "cannot-supply" or "need-from-owner", which is an honest answer.

## Regulated trades

If the research marks this business as regulated, the listed claims go into mustNotSay verbatim-in-substance, and the owner's open questions go into risks. Do not soften them and do not decide them for the owner.

For these trades the safe site describes the room, the hours and the people. It does not sell the effect of the product, and it makes no claim about health, safety, or what the product does for the customer - no evidence this tool could ever hold would support one.`;

/** The catalogue, compact enough to send whole and stable enough to cache. */
function designCatalogue() {
  const designs = listDesigns();
  if (designs.length === 0) throw new HttpError(500, "No design systems were found", { hint: "Check DESIGN_MD_DIR." });
  const lines = designs.map(
    (d) => `- ${d.key} — ${d.label}${d.primary ? ` (primary ${d.primary})` : ""}: ${d.description || "no description"}`,
  );
  return {
    keys: designs.map((d) => d.key),
    text:
      `# Design systems to choose from (${designs.length})\n\n` +
      "Each is a documented system with real colour tokens, type scale and component patterns. Choose by key.\n\n" +
      lines.join("\n"),
  };
}

/** Everything stage 1 produced, as the brief will see it. */
export async function runResearch(business, { fetchRivals = 3 } = {}) {
  const evidence = buildEvidence(business);
  const competitors = await researchCompetitors(business, { fetch: fetchRivals });
  return {
    competitors: competitors.set,
    rivals: competitors.rivals,
    brand: researchBrand(business, { reviews: evidence.content.reviews, vision: evidence.vision }),
    localSeo: researchLocalSeo(business, { socials: evidence.content.socials }),
    gatheredAt: new Date().toISOString(),
  };
}

function researchText(research) {
  const blocks = [];

  blocks.push(
    "# The competitive set\n\n" +
      (research.competitors.basis === "scanned-set"
        ? "Computed from businesses of the same trade already scanned near this one. These numbers are facts and may be used on the site; anything not here may not be implied.\n\n"
        : "There is no usable competitive set. You may not state or imply any ranking or comparison.\n\n") +
      "```json\n" + JSON.stringify(research.competitors, null, 2) + "\n```",
  );

  blocks.push(
    "# What the local rivals' own websites look like\n\n" +
      (research.rivals.basis === "observed"
        ? `Read directly from ${research.rivals.read} rival homepage(s). 'crowdedHues' and 'crowdedFonts' are what a majority of them already use - matching those makes this business invisible. 'tableStakes' is what a majority have.\n\n`
        : "No rival homepage could be read. Do not assert what rivals do or do not do.\n\n") +
      "```json\n" + JSON.stringify(research.rivals, null, 2) + "\n```",
  );

  blocks.push(
    "# Brand signals\n\n" +
      "The trading name's own signals, the trade's conventions, and the words customers reach for (counts only - no phrase from a review reaches you or the site).\n\n" +
      (research.brand.regulated
        ? `**This is a ${research.brand.regulated.label} business.** The \`regulated\` block below is not advice to weigh: its mustNotSay entries are constraints, and its ownerDecides entries are questions for the owner that belong in risks. QA enforces the first list and does not accept the plan as a defence.\n\n`
        : "") +
      "```json\n" + JSON.stringify(research.brand, null, 2) + "\n```",
  );

  blocks.push(
    "# Local search\n\n" +
      "Query patterns, schema type and the NAP strings. Applied deterministically at render; here for context on what customers are actually typing.\n\n" +
      "```json\n" + JSON.stringify({ ...research.localSeo, gbp: undefined }, null, 2) + "\n```",
  );

  return blocks.join("\n\n---\n\n");
}

/**
 * Write the brief.
 *
 * The design catalogue is sent as the cacheable prefix because it is identical
 * for every business, so the second brief of a session pays for it once.
 */
export async function writeBrief({ business, research, designKey = null }, onEvent = () => {}) {
  const evidence = buildEvidence(business);
  const catalogue = designCatalogue();

  const instruction = designKey
    ? `Write the brief for ${business.name}.\n\nThe operator has overridden the design choice to "${designKey}". Use that key, and in designRationale say honestly whether it is the choice you would have made and what you would have picked instead.`
    : `Write the brief for ${business.name}. Choose the design system yourself.`;

  const message = await send(
    {
      model: genConfig().model,
      max_tokens: 32000,
      system: BRIEF_SYSTEM,
      thinking: { type: "adaptive", display: "summarized" },
      output_config: {
        effort: genConfig().effort,
        format: { type: "json_schema", schema: CREATIVE_BRIEF_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: catalogue.text, cache_control: { type: "ephemeral" } },
            { type: "text", text: evidenceText(evidence) },
            { type: "text", text: researchText(research) },
            { type: "text", text: instruction },
          ],
        },
      ],
    },
    onEvent,
  );

  let brief;
  try {
    brief = JSON.parse(textOf(message));
  } catch (err) {
    throw new HttpError(502, "The brief did not come back as usable JSON", { detail: err.message });
  }

  const problems = validateBrief(brief, { designKeys: catalogue.keys });
  if (problems.length > 0) throw new HttpError(502, `The brief is not usable: ${problems.join("; ")}`);

  if (designKey && brief.artDirection.designKey !== designKey) {
    // The override is the operator's call, not the model's.
    brief.artDirection.designKeyOverridden = brief.artDirection.designKey;
    brief.artDirection.designKey = designKey;
  }

  return { brief, usage: usageOf(message), model: config.gen.model };
}
