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

/**
 * The creative brief: what the site is for, who it is against, and what it
 * should feel like - decided before a word of copy exists.
 *
 * Strategy and art direction are one object on purpose. They are the same
 * decision made by the same person in the same sitting; splitting them is how
 * copy and design end up arguing with each other.
 */
export const CREATIVE_BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["conversionGoal", "conversionRationale", "audiences", "positioning", "voice", "artDirection", "navigation"],
  properties: {
    conversionGoal: {
      type: "string",
      enum: ["call", "book", "visit", "quote", "order"],
      description: "The one action the whole site exists to produce. Only choose 'book' or 'order' if a real booking or ordering destination exists in the evidence.",
    },
    conversionRationale: {
      type: "string",
      description: "Why that action and not another, in terms of how this category's customers actually decide.",
    },
    audiences: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["who", "intentState", "needsToSee"],
        properties: {
          who: { type: "string" },
          intentState: {
            type: "string",
            enum: ["emergency", "comparing", "loyal", "discovering"],
            description: "What state they arrive in. It decides what goes above the fold.",
          },
          needsToSee: { type: "string", description: "The one thing that converts this person." },
        },
      },
    },
    positioning: {
      type: "object",
      additionalProperties: false,
      required: ["claim", "proof", "parity", "mustNotSay"],
      properties: {
        claim: { type: "string", description: "One sentence. What this business is, better than the alternatives, that the evidence supports." },
        proof: { type: "string", description: "The specific evidence that entitles the claim. Name it." },
        parity: {
          type: "array",
          description: "True of this business but equally true of every rival, so it must never get hero treatment. Naming these is how the hero stops being generic.",
          items: { type: "string" },
        },
        mustNotSay: {
          type: "array",
          description: "Phrases and claims this site must not contain, because they are unsupported, contested in the reviews, or what every rival already says.",
          items: { type: "string" },
        },
      },
    },
    voice: {
      type: "object",
      additionalProperties: false,
      required: ["register", "tagline", "dos", "donts"],
      properties: {
        register: { type: "string", description: "How it sounds, in one sentence, traceable to the evidence." },
        tagline: { type: "string", description: "One original line. No superlative you cannot prove." },
        dos: { type: "array", items: { type: "string" } },
        donts: { type: "array", items: { type: "string" } },
      },
    },
    artDirection: {
      type: "object",
      additionalProperties: false,
      required: ["designKey", "designRationale", "typeRegister", "layoutArchetype", "imageStrategy", "wordmark"],
      properties: {
        designKey: {
          type: "string",
          description: "One key from the catalogue of design systems you were given. Exact key, not the label.",
        },
        designRationale: {
          type: "string",
          description: "Why this system for this business. Cite the competitive set: what the rivals look like and how this differs. If no competitive set was available, say that plainly instead of implying one.",
        },
        rejected: {
          type: "array",
          description: "A system you considered and did not choose, and why. One or two.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["designKey", "why"],
            properties: { designKey: { type: "string" }, why: { type: "string" } },
          },
        },
        paletteOverride: {
          type: "array",
          description: "Only when a colour was actually observed at the premises, or the chosen system's palette collides with the local norm. Each entry must say why.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["role", "hex", "why"],
            properties: {
              role: { type: "string", enum: ["primary", "accent", "surface", "ink"] },
              hex: { type: "string", description: "#rrggbb" },
              why: { type: "string" },
            },
          },
        },
        typeRegister: { type: "string", description: "The typographic register in words, e.g. 'condensed grotesque for headings, plain humanist for body'." },
        layoutArchetype: {
          type: "string",
          enum: ["single-column-editorial", "split-hero", "full-bleed-image", "card-grid", "centred-minimal", "sidebar-utility"],
        },
        imageStrategy: {
          type: "string",
          enum: ["type-and-colour-only", "css-texture", "marked-photo-slots", "abstract-generated"],
          description: "No real photograph of these premises is available to the site, so this decides what fills the frame instead.",
        },
        wordmark: {
          type: "object",
          additionalProperties: false,
          required: ["treatment"],
          properties: {
            treatment: { type: "string", description: "How the name is set. A wordmark from the type system - never a generated logo mark." },
            note: { type: "string" },
          },
        },
      },
    },
    navigation: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      description: "The pages, decided from the conversion goal rather than a template. The planner must honour this.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "slug", "why"],
        properties: {
          label: { type: "string", description: "Two words at most." },
          slug: { type: "string", description: "'index' for the home page; otherwise lowercase hyphenated." },
          why: { type: "string", description: "What this page does for the conversion goal. If you cannot answer, drop the page." },
        },
      },
    },
    tableStakes: {
      type: "array",
      description: "What rival sites have that this one would look amateur without, and whether we can supply it.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "status"],
        properties: {
          item: { type: "string" },
          status: {
            type: "string",
            enum: ["have", "need-from-owner", "cannot-supply"],
            description: "'cannot-supply' is an honest answer: we have no prices, no menu and no real photographs.",
          },
        },
      },
    },
    risks: {
      type: "array",
      description: "What could make this site wrong or embarrassing, from the evidence you were given.",
      items: { type: "string" },
    },
  },
};

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Structural check on a brief, whatever produced it. */
export function validateBrief(brief, { designKeys = null } = {}) {
  const problems = [];
  if (!brief || typeof brief !== "object") return ["Brief is not an object"];

  const art = brief.artDirection ?? {};
  if (!art.designKey) problems.push("Brief chose no design system");
  else if (designKeys && !designKeys.includes(art.designKey)) {
    problems.push(`Brief chose a design system that does not exist: ${art.designKey}`);
  }
  // The rationale is the whole reason the choice is automated rather than a
  // dropdown. A one-line rationale means the choice was not actually made.
  if ((art.designRationale ?? "").trim().length < 40) {
    problems.push("The design choice has no real rationale");
  }
  for (const o of art.paletteOverride ?? []) {
    if (!/^#[0-9a-fA-F]{6}$/.test(o.hex ?? "")) problems.push(`Palette override is not a #rrggbb hex: ${o.hex}`);
  }

  const nav = brief.navigation ?? [];
  if (!nav.some((p) => p.slug === "index")) problems.push("Brief's navigation has no 'index' page");
  const slugs = new Set();
  for (const page of nav) {
    if (!SLUG.test(page.slug ?? "")) problems.push(`Unusable nav slug: ${page.slug}`);
    if (slugs.has(page.slug)) problems.push(`Duplicate nav slug: ${page.slug}`);
    slugs.add(page.slug);
  }

  if (!brief.positioning?.claim) problems.push("Brief has no positioning claim");
  if (!brief.positioning?.proof) problems.push("Brief's positioning claim has no stated proof");
  if (!brief.voice?.tagline) problems.push("Brief has no tagline");

  return problems;
}

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

/**
 * Does the plan actually do what the brief decided?
 *
 * Without this the brief is decoration: the planner can read it, ignore it and
 * produce the same template-shaped site. These are warnings rather than hard
 * failures because a planner that drops a page for lack of evidence is
 * behaving correctly - but it has to be visible that it did.
 */
export function planHonoursBrief(plan, brief) {
  if (!plan || !brief) return [];
  const problems = [];

  const planned = new Set((plan.pages ?? []).map((p) => p.slug));
  const briefed = new Set((brief.navigation ?? []).map((p) => p.slug));

  for (const slug of briefed) {
    if (!planned.has(slug)) problems.push(`Brief asked for a "${slug}" page; the plan does not have one`);
  }
  for (const slug of planned) {
    if (!briefed.has(slug)) problems.push(`Plan added a "${slug}" page the brief did not ask for`);
  }

  const href = plan.primaryAction?.href ?? "";
  const expected = {
    call: /^tel:/i,
    book: /^(tel:|https?:|#)/i,
    visit: /^(https?:\/\/(www\.)?google\.[a-z.]+\/maps|https?:\/\/maps\.|#)/i,
    quote: /^(tel:|mailto:|#)/i,
    order: /^(https?:|tel:|#)/i,
  }[brief.conversionGoal];
  if (expected && !expected.test(href)) {
    problems.push(`Conversion goal is "${brief.conversionGoal}" but the primary action is "${href}"`);
  }

  const banned = (brief.positioning?.mustNotSay ?? []).filter((s) => s && s.length > 3);
  const haystack = JSON.stringify(plan).toLowerCase();
  for (const phrase of banned) {
    if (haystack.includes(phrase.toLowerCase())) problems.push(`Plan contains a mustNotSay phrase: "${phrase}"`);
  }

  return problems;
}

/** Sections resting only on category generalities - worth a second look. */
export const weakSections = (plan) =>
  (plan?.pages ?? []).flatMap((page) =>
    (page.sections ?? [])
      .filter((s) => s.confidence === "low" || (s.evidence ?? []).every((e) => e.source === "category-norm"))
      .map((s) => ({ page: page.slug, heading: s.heading, confidence: s.confidence })),
  );
