/**
 * The content plan: what the site will say, and why it is entitled to say it.
 *
 * Every section carries its own evidence and confidence. That is the whole
 * point of planning before rendering - you can read the plan, see which claim
 * rests on which review, and delete anything that is not earned, before a line
 * of HTML exists.
 */

const EVIDENCE = {
  type: "object",
  additionalProperties: false,
  required: ["source", "supports"],
  properties: {
    source: {
      type: "string",
      enum: ["google-fact", "review", "editorial-summary", "operator-notes", "photo", "category-norm"],
      description:
        "Where this came from. 'category-norm' means it is only a safe generality for this kind of business, not something you were told.",
    },
    ref: { type: "string", description: "Which one, e.g. 'review 3' or 'opening hours'." },
    supports: { type: "string", description: "The specific claim this backs up." },
  },
};

const SECTION = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "heading", "body", "evidence", "confidence"],
  properties: {
    kind: {
      type: "string",
      enum: ["hero", "services", "about", "proof", "hours", "location", "faq", "cta", "photos-placeholder"],
    },
    heading: { type: "string" },
    body: { type: "string", description: "Original prose. Never review text, never a quote." },
    items: {
      type: "array",
      description: "Named items for a services or FAQ section.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    evidence: { type: "array", items: EVIDENCE },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description:
        "high = stated in the verified facts or named across several reviews. medium = named once. low = a category generality.",
    },
    placeholders: {
      type: "array",
      description: "What the owner still has to supply here.",
      items: { type: "string" },
    },
  },
};

const PAGE = {
  type: "object",
  additionalProperties: false,
  required: ["slug", "navLabel", "title", "purpose", "sections"],
  properties: {
    slug: {
      type: "string",
      description: "'index' for the home page; otherwise lowercase words joined by hyphens, e.g. 'services'.",
    },
    navLabel: { type: "string", description: "Two words at most." },
    title: { type: "string", description: "The <title>, including the business name." },
    purpose: { type: "string", description: "One sentence: who this page is for and what it gets them to do." },
    sections: { type: "array", items: SECTION },
  },
};

export const CONTENT_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tagline", "voice", "primaryAction", "pages", "ownerTodos", "claimsAvoided"],
  properties: {
    tagline: { type: "string", description: "One original line. No superlatives you cannot support." },
    voice: { type: "string", description: "How this business should sound, in one sentence, drawn from the evidence." },
    primaryAction: {
      type: "object",
      additionalProperties: false,
      required: ["label", "href"],
      properties: {
        label: { type: "string" },
        href: { type: "string", description: "A tel: link, a maps link, or an anchor. Never an invented URL." },
      },
    },
    pages: { type: "array", items: PAGE },
    ownerTodos: {
      type: "array",
      description: "What the owner must supply before this site is honest and complete.",
      items: { type: "string" },
    },
    claimsAvoided: {
      type: "array",
      description: "Things a generic generator would have written here that you deliberately did not, because nothing supported them.",
      items: { type: "string" },
    },
  },
};

/** Cheap structural check on a plan, whatever produced it. */
export function validatePlan(plan) {
  const problems = [];
  if (!plan || typeof plan !== "object") return ["Plan is not an object"];
  if (!Array.isArray(plan.pages) || plan.pages.length === 0) problems.push("Plan has no pages");

  const slugs = new Set();
  for (const [i, page] of (plan.pages ?? []).entries()) {
    if (!page.slug) problems.push(`Page ${i} has no slug`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(page.slug ?? "")) problems.push(`Page ${i} has an unusable slug: ${page.slug}`);
    if (slugs.has(page.slug)) problems.push(`Duplicate page slug: ${page.slug}`);
    slugs.add(page.slug);
    if (!Array.isArray(page.sections) || page.sections.length === 0) {
      problems.push(`Page "${page.slug}" has no sections`);
    }
  }
  if (!slugs.has("index")) problems.push("Plan has no 'index' page");
  return problems;
}

/** Sections resting only on category generalities - worth a second look. */
export const weakSections = (plan) =>
  (plan?.pages ?? []).flatMap((page) =>
    (page.sections ?? [])
      .filter((s) => s.confidence === "low" || (s.evidence ?? []).every((e) => e.source === "category-norm"))
      .map((s) => ({ page: page.slug, heading: s.heading, confidence: s.confidence })),
  );
