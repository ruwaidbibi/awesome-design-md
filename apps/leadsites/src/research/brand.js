/**
 * Stage 1b - brand understanding, assembled rather than invented.
 *
 * No model call. This file gathers the raw material a strategist would read
 * before writing a brief: what the trading name already signals, which words
 * customers reach for, what the trade's conventions are, and any colour
 * actually observed at the premises.
 *
 * One deliberate constraint on the review half. Customer vocabulary is
 * extracted as **single words with counts**, never phrases. A word frequency is
 * a derived statistic; a phrase is a fragment of someone's review, and the
 * whole point of the no-verbatim rule is that those never travel. This is also
 * why nothing here is a quote.
 */

/**
 * Words in a trading name that carry meaning before a line of copy is written.
 *
 * "Blessed Hands Barber Parlor" is craft, faith and old-school refinement; it
 * is not the same brand as "Fade Factory" and should not be designed like it.
 */
const NAME_SIGNALS = [
  { pattern: /\bparlo(u)?r\b/i, signal: "old-school, pre-salon register - 'parlor' is a deliberately traditional word" },
  { pattern: /\bbarbershop\b|\bbarber\b/i, signal: "trade stated plainly in the name" },
  { pattern: /\bblessed\b|\bfaith\b|\bgrace\b|\banointed\b/i, signal: "faith reference - treat with respect, never as decoration" },
  { pattern: /\b(&|and)\s+sons?\b|\b(&|and)\s+daughters?\b/i, signal: "family succession claimed in the name" },
  { pattern: /\bbros\b|\bbrothers\b|\bsisters\b/i, signal: "family or partnership" },
  { pattern: /'s\b|’s\b/, signal: "possessive - an owner-operator, named" },
  { pattern: /\bco\b\.?$|\bcompany\b|\btrading\b/i, signal: "formal, heritage-leaning register" },
  { pattern: /\bstudio\b/i, signal: "design-adjacent, modern, appointment-led" },
  { pattern: /\blounge\b/i, signal: "comfort and dwell time over throughput" },
  { pattern: /\bexpress\b|\bquick\b|\bfast\b/i, signal: "speed is the promise" },
  { pattern: /\bluxe\b|\bluxury\b|\belite\b|\bpremier\b/i, signal: "premium claimed - the site must earn it or drop it" },
  { pattern: /\bauthentic\b|\btraditional\b|\boriginal\b/i, signal: "authenticity claimed in the name" },
  { pattern: /\bkitchen\b|\bgrill\b|\bcafe\b|\bdeli\b|\btaqueria\b|\btrattoria\b/i, signal: "food format named - sets the expected menu and room" },
  { pattern: /\bmobile\b/i, signal: "they come to the customer" },
  { pattern: /\b(est|since)\.?\s*(18|19|20)\d{2}\b/i, signal: "a founding year is in the name - the only safe route to a heritage claim" },
  { pattern: /\b\d+\b/, signal: "a number in the name - check what it refers to before using it typographically" },
];

const STOPWORDS = new Set(`
a about after again all also always am an and any are as at back be because been before being best better but by
came can come could day did didn do does doing don done down each even every few first for from get go going good got
great had has have he her here him his how i if in into is it its just know like little long made make man many me
more most much must my never new next no not now of off on once one only or other our out over own place put really
right said same say see she should so some still such take than that the their them then there these they thing think
this those through time to told too two up us use used very want was way we well went were what when where which while
who will with work would year years you your
`.trim().split(/\s+/));

// Words that describe the *review* rather than the business. Customers write
// them constantly and they carry no brand signal.
const REVIEW_NOISE = new Set(`
review reviews star stars rating google recommend recommended recommendation definitely absolutely highly
experience service customer business thank thanks thankyou amazing awesome excellent perfect love loved nice
`.trim().split(/\s+/));

/**
 * The words customers actually use, as counts.
 *
 * Unigrams only, and nothing that appears once: a word used by three different
 * customers is a signal, a word used by one is that person's vocabulary.
 */
export function customerVocabulary(reviews, { minCount = 2, limit = 30 } = {}) {
  const docFreq = new Map();
  const total = new Map();

  for (const review of reviews) {
    const words = String(review?.text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9'\s-]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !REVIEW_NOISE.has(w) && !/^\d+$/.test(w));

    for (const w of new Set(words)) docFreq.set(w, (docFreq.get(w) ?? 0) + 1);
    for (const w of words) total.set(w, (total.get(w) ?? 0) + 1);
  }

  return [...docFreq.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1] || (total.get(b[0]) - total.get(a[0])))
    .slice(0, limit)
    .map(([word, reviewsMentioning]) => ({ word, reviewsMentioning, uses: total.get(word) }));
}

/**
 * Conventions of the trade, as constraints rather than instructions.
 *
 * These are honest generalities, labelled as such. They exist so the brief can
 * reject a convention on purpose instead of stumbling into it.
 */
const CATEGORY_CONVENTIONS = {
  barber_shop: {
    customerDecides: "on proof of skill and whether they can get in today",
    conventional: ["dark walls with a gold or red accent", "script or slab wordmark", "pole motif", "chair photography"],
    expects: ["who cuts", "how to book or whether walk-ins are taken", "where to park"],
    conversion: "call",
  },
  hair_salon: {
    customerDecides: "on portfolio and on trust with a specific stylist",
    conventional: ["pale neutrals", "thin serif type", "editorial portrait photography"],
    expects: ["service list", "stylist names", "booking"],
    conversion: "book",
  },
  restaurant: {
    customerDecides: "on the menu and whether tonight is possible",
    conventional: ["full-bleed food photography", "warm dark palette", "script display type"],
    expects: ["menu", "hours", "address", "whether to reserve"],
    conversion: "visit",
  },
  cafe: {
    customerDecides: "on proximity, atmosphere and whether they can sit and work",
    conventional: ["cream and sage", "rounded sans type", "latte-art photography"],
    expects: ["hours", "where it is", "whether there is seating and wifi"],
    conversion: "visit",
  },
  coffee_shop: {
    customerDecides: "on proximity and the quality of the coffee itself",
    conventional: ["kraft brown and cream", "stamp or badge wordmark", "bean imagery"],
    expects: ["hours", "where it is", "what they roast or pour"],
    conversion: "visit",
  },
  car_repair: {
    customerDecides: "under pressure, usually with a car that is already broken",
    conventional: ["blue and silver", "bold condensed type", "wrench and gauge iconography"],
    expects: ["phone number immediately", "what they work on", "whether they can look today"],
    conversion: "call",
  },
  plumber: {
    customerDecides: "in an emergency, on whoever answers the phone",
    conventional: ["blue, white and a hazard accent", "badge with a licence number", "stock van photography"],
    expects: ["phone number above the fold", "service area", "whether it is 24 hour"],
    conversion: "call",
  },
  electrician: {
    customerDecides: "on trust and licensing, rarely on price",
    conventional: ["yellow and navy", "bolt iconography", "safety language"],
    expects: ["phone number", "service area", "licence status"],
    conversion: "call",
  },
  roofing_contractor: {
    customerDecides: "after damage, comparing two or three quotes",
    conventional: ["red and charcoal", "roofline photography", "financing banners"],
    expects: ["service area", "what they handle", "how to get a quote"],
    conversion: "quote",
  },
  nail_salon: {
    customerDecides: "on portfolio and cleanliness",
    conventional: ["pink and gold", "script type", "close-up hand photography"],
    expects: ["service list", "booking", "hours"],
    conversion: "book",
  },
  tailor: {
    customerDecides: "on precision and turnaround",
    conventional: ["navy and cream", "serif type", "fabric and thread imagery"],
    expects: ["what they alter", "turnaround", "where to drop off"],
    conversion: "visit",
  },
  cigar_shop: {
    customerDecides: "on the humidor's range and whether it is somewhere to sit for two hours",
    conventional: [
      "near-black with oxblood or gold",
      "engraved or script wordmark, often with a crest",
      "close-up smoke and leaf photography",
      "Spanish-colonial or speakeasy styling",
    ],
    expects: ["what is in the humidor", "whether there is a bar", "how late it is open", "whether there is a members' or private room"],
    conversion: "visit",
    regulated: "tobacco",
  },
  tobacco_shop: {
    customerDecides: "on range and proximity",
    conventional: ["near-black with gold", "crest or seal", "leaf and smoke imagery"],
    expects: ["what they stock", "hours", "where it is"],
    conversion: "visit",
    regulated: "tobacco",
  },
  bar: {
    customerDecides: "on atmosphere, and on whether tonight is possible",
    conventional: ["dark walls with neon or brass", "condensed display type", "low-light interior photography"],
    expects: ["how late it is open", "what is on", "where it is"],
    conversion: "visit",
    regulated: "alcohol",
  },
  wine_bar: {
    customerDecides: "on the list and the room",
    conventional: ["warm neutrals and oxblood", "high-contrast serif", "glassware photography"],
    expects: ["what is poured by the glass", "hours", "whether to reserve"],
    conversion: "visit",
    regulated: "alcohol",
  },
  night_club: {
    customerDecides: "on who is playing and who else is going",
    conventional: ["black with saturated accent", "heavy display type", "crowd photography"],
    expects: ["who is on and when", "hours", "entry"],
    conversion: "visit",
    regulated: "alcohol",
  },
};

/**
 * Trades where some claims are not merely unsupported but unsafe.
 *
 * This is not legal advice and does not try to be: it encodes no statute and
 * names no jurisdiction. It is the much narrower observation that a health or
 * safety claim about tobacco or alcohol can never be supported by anything this
 * tool could ever be given, so the brief should rule it out before anyone writes
 * it, and QA should catch it if they do. Anything beyond that - an age gate, a
 * required warning, promotional restrictions - is the owner's decision with
 * their own counsel, and is surfaced as a question rather than an answer.
 */
export const REGULATED = {
  tobacco: {
    label: "tobacco",
    mustNotSay: [
      "any claim that a product is healthier, safer, milder, cleaner or less harmful",
      "any medical, wellness or relaxation-as-therapy benefit",
      "anything that would appeal to someone under the legal purchase age, including cartoon styling, sweets language or school or sports-team imagery",
      "any suggestion that smoking improves performance, status, attractiveness or social success",
      "any discount, bundle or free-product offer, which is restricted in many places",
    ],
    ownerDecides: [
      "Whether the site needs an age-affirmation step before entry, and what your counsel requires it to say.",
      "Whether any statutory warning text has to appear, and in what form.",
      "Whether you may show products and prices online at all in your state.",
    ],
    note: "A site for this trade is safest describing the room, the hours and the people, and leaving the products to the humidor itself.",
  },
  alcohol: {
    label: "alcohol",
    mustNotSay: [
      "any claim that drinking is healthy, therapeutic or restorative",
      "any suggestion that drinking improves performance, status, attractiveness or social success",
      "anything that would appeal to someone under the legal drinking age",
      "any encouragement of quantity, speed or intoxication, including bottomless or unlimited framings",
    ],
    ownerDecides: [
      "Whether the site needs an age-affirmation step before entry.",
      "Whether your licence restricts how prices or promotions may be shown.",
    ],
    note: "Describe the room and the list. Do not sell the effect.",
  },
};

export const regulationFor = (primaryType) => {
  const key = conventionsFor(primaryType).regulated;
  return key ? REGULATED[key] : null;
};

const DEFAULT_CONVENTION = {
  customerDecides: "on proximity, proof and whether they can be served soon",
  conventional: [],
  expects: ["what the business does", "where it is", "how to reach it"],
  conversion: "call",
};

export const conventionsFor = (primaryType) => CATEGORY_CONVENTIONS[primaryType ?? ""] ?? DEFAULT_CONVENTION;

/** What the trading name itself tells us. */
export function nameAnalysis(name) {
  const clean = String(name ?? "").trim();
  // A Google listing name often carries a second part after a pipe or dash:
  // "Blessed Hands Barber Parlor | Jovanni The Barber".
  const [trading, ...rest] = clean.split(/\s*[|·]\s*/);
  const signals = NAME_SIGNALS.filter((s) => s.pattern.test(clean)).map((s) => s.signal);

  return {
    full: clean,
    trading: trading?.trim() || clean,
    suffix: rest.length ? rest.join(" | ").trim() : null,
    wordCount: (trading ?? clean).trim().split(/\s+/).length,
    signals,
    // A long name cannot be set at display size in two words' worth of space,
    // and that is an art-direction constraint, not a nicety.
    wordmarkNote:
      (trading ?? clean).length > 22
        ? "Long name: the wordmark needs a stacked or two-line lockup, not a single line at display size."
        : "Short enough to set on one line at display size.",
  };
}

/** Stage 1b, assembled. */
export function researchBrand(business, { reviews = [], vision = null } = {}) {
  return {
    name: nameAnalysis(business.name),
    conventions: conventionsFor(business.primary_type),
    regulated: regulationFor(business.primary_type),
    vocabulary: customerVocabulary(reviews),
    vocabularyBasis:
      reviews.length === 0
        ? "No review text available, so there is no observed customer vocabulary. Write in the plain register the category implies."
        : `Words used by at least two of ${reviews.length} reviewers. Counts only - no phrase from a review travels past this point.`,
    observedPalette: vision?.usable ? (vision.palette ?? []) : [],
    observedScene: vision?.usable ? (vision.scene ?? null) : null,
  };
}
