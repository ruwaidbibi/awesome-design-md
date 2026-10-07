/**
 * Stage 6 - QA. No model call for any of this.
 *
 * Up to now "the generator never quotes a review" and "the generator never
 * invents a credential" have been prompt instructions that I have been
 * asserting hold. An instruction is not evidence. These gates measure it, per
 * build, and the hard ones block publishing.
 *
 * Two levels, and the distinction matters:
 *   hard - the site is wrong or legally dangerous. Publish is blocked.
 *   warn - the site is worse than it should be. Visible, never blocking.
 *
 * Nothing here needs the network or a key, so it runs on every build and in
 * the test suite.
 */
import { regulationFor } from "../research/brand.js";
import { buildEvidence } from "./evidence.js";

const NGRAM_MIN = 5;
const NGRAM_MAX = 20;

// ---------------------------------------------------------------------------
// Text handling
// ---------------------------------------------------------------------------

/** Visible words, lowercased. Script and style contents are not visible text. */
export function visibleWords(html) {
  const text = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:[a-z]+|#\d+);/gi, " ");
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

export const visibleText = (html) => visibleWords(html).join(" ");

/**
 * Visible text with its punctuation intact.
 *
 * `visibleWords` throws away everything that is not a letter or a digit, which
 * is right for comparing wording and wrong for finding claims: a price is "$25"
 * and an email address is punctuation held together by letters. Both would be
 * invisible to a word-level view.
 */
export function visibleProse(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;?/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * One spelling for text that means the same thing.
 *
 * "Family-owned" in a plan and "family owned" on the page are the same claim,
 * and a check that treats them as different is a check that can be defeated by
 * a hyphen. Dashes, slashes and underscores all collapse to a space; every
 * other mark is kept, because `$` and `@` are the signal in two of the
 * patterns below.
 */
const loose = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[‐-―−\-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const grams = (words, n) => {
  const out = new Set();
  for (let i = 0; i + n <= words.length; i += 1) out.add(words.slice(i, i + n).join(" "));
  return out;
};

/**
 * The longest run of words the page shares with the source text.
 *
 * This is the measurement behind the no-verbatim rule. Five words is the
 * threshold: shorter runs happen by chance between any two texts about the
 * same subject ("one of the best in"), longer ones do not.
 */
export function longestSharedRun(pageHtml, sourceText) {
  const page = visibleWords(pageHtml);
  const source = visibleWords(sourceText);
  if (page.length < NGRAM_MIN || source.length < NGRAM_MIN) return { length: 0, sample: null };

  let length = 0;
  let sample = null;
  for (let n = NGRAM_MIN; n <= NGRAM_MAX; n += 1) {
    const a = grams(page, n);
    if (a.size === 0) break;
    const b = grams(source, n);
    let hit = null;
    for (const g of a) {
      if (b.has(g)) { hit = g; break; }
    }
    if (!hit) break;
    length = n;
    sample = hit;
  }
  return { length, sample };
}

const digitsOf = (s) => String(s ?? "").replace(/\D/g, "");

// ---------------------------------------------------------------------------
// Claim detectors
// ---------------------------------------------------------------------------

/**
 * Claims that are flatly unsafe unless something we were given says them.
 *
 * Every one of these is a thing a generic generator writes by reflex and a
 * thing a business owner can be held to. A founding year, a licence, a
 * guarantee and a price are all checkable by a customer, and getting one wrong
 * on a real business's homepage is the failure mode that matters most.
 */
const CLAIM_PATTERNS = [
  { id: "founding-year", re: /\b(?:since|est\.?|established(?:\s+in)?)\s*(?:18|19|20)\d{2}\b/gi, what: "a founding year" },
  { id: "years-in-business", re: /\b\d{1,3}\+?\s*(?:years|yrs)\b(?:[^.]{0,30}?\b(?:experience|business|serving|trading|strong)\b)/gi, what: "years in business" },
  { id: "family-owned", re: /\bfamily[-\s]owned\b|\bthird[-\s]generation\b|\bsecond[-\s]generation\b/gi, what: "family ownership" },
  { id: "awards", re: /\baward[-\s]winning\b|\bvoted\s+(?:the\s+)?best\b|\b#1\b|\bnumber one\b|\baward\b/gi, what: "an award" },
  { id: "credentials", re: /\b(?:licen[cs]ed|certified|accredited|bonded|insured|board[-\s]certified)\b/gi, what: "a credential" },
  { id: "guarantee", re: /\bguarantee[ds]?\b|\bwarrant(?:y|ies|ied)\b|\bmoney[-\s]back\b/gi, what: "a guarantee" },
  { id: "free-offer", re: /\bfree\s+(?:estimate|quote|consultation|delivery|inspection|trial)\b/gi, what: "a free offer" },
  { id: "prices", re: /\$\s?\d/g, what: "a price" },
  { id: "email", re: /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, what: "an email address" },
  { id: "availability", re: /\b24\/7\b|\bopen 24 hours\b|\bsame[-\s]day\b|\bemergency service\b/gi, what: "an availability promise" },
  { id: "staff-count", re: /\bteam of \d+\b|\b\d+ (?:barbers|stylists|technicians|mechanics|staff)\b/gi, what: "a staff count" },
  { id: "locations", re: /\b(?:two|three|four|\d+) locations\b|\bour other (?:shop|store|location)\b/gi, what: "a second location" },
  { id: "delivery-partners", re: /\b(?:doordash|uber eats|grubhub|postmates|seamless|instacart)\b/gi, what: "a delivery partner" },
];

/**
 * Did a claim appear during rendering?
 *
 * A claim is acceptable only if the plan already made it (in which case it
 * carries evidence, which is auditable) or the evidence itself contains it. A
 * claim present in neither was invented between the plan and the HTML, which is
 * precisely the failure this gate exists to catch.
 */
function findUnsupportedClaims({ html, planText, evidenceText }) {
  const text = loose(visibleProse(html));
  const found = [];

  for (const { id, re, what } of CLAIM_PATTERNS) {
    for (const match of text.matchAll(re)) {
      const phrase = match[0].trim();
      if (planText.includes(phrase) || evidenceText.includes(phrase)) continue;
      found.push({ id, what, phrase, where: context(text, match.index) });
    }
  }
  // One instance of each kind is enough to report; the fix is the same.
  const seen = new Set();
  return found.filter((f) => (seen.has(f.id + f.phrase) ? false : seen.add(f.id + f.phrase)));
}

const context = (text, index) =>
  text.slice(Math.max(0, index - 40), Math.min(text.length, index + 60)).trim();

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

const ok = (detail = null) => ({ pass: true, detail });
const bad = (detail, items = []) => ({ pass: false, detail, items });

const GATES = [
  {
    id: "no-review-text",
    level: "hard",
    label: "No review text reached a page",
    run({ pages, reviews }) {
      if (reviews.length === 0) return ok("No review text on file to check against.");
      const source = reviews.map((r) => r.text).join("\n");
      const hits = [];
      let worst = 0;
      for (const page of pages) {
        const { length, sample } = longestSharedRun(page.html, source);
        worst = Math.max(worst, length);
        if (length >= NGRAM_MIN) hits.push({ page: page.file, run: length, sample });
      }
      return hits.length === 0
        ? ok(`Longest run shared with a review: ${worst} words (threshold ${NGRAM_MIN}).`)
        : bad(`${hits.length} page(s) reuse review wording.`, hits);
    },
  },
  {
    id: "no-reviewer-names",
    level: "hard",
    label: "No reviewer is named",
    run({ pages, reviews }) {
      const names = [...new Set(reviews.map((r) => r.author).filter((n) => n && n.length > 3))];
      if (names.length === 0) return ok("No reviewer names on file.");
      const hits = [];
      for (const page of pages) {
        const text = loose(visibleProse(page.html));
        for (const name of names) {
          // Full name only. A shared first name is not evidence of anything.
          if (name.includes(" ") && text.includes(loose(name))) hits.push({ page: page.file, name });
        }
      }
      return hits.length === 0 ? ok(`${names.length} reviewer name(s) checked.`) : bad("A reviewer is named on the site.", hits);
    },
  },
  {
    id: "unsupported-claims",
    level: "hard",
    label: "No claim appeared during rendering",
    run({ pages, planText, evidenceText }) {
      const hits = pages.flatMap((page) =>
        findUnsupportedClaims({ html: page.html, planText, evidenceText }).map((f) => ({ page: page.file, ...f })),
      );
      return hits.length === 0
        ? ok(`${CLAIM_PATTERNS.length} claim patterns checked against the plan and the evidence.`)
        : bad(`${hits.length} claim(s) on the page are in neither the plan nor the evidence.`, hits);
    },
  },
  {
    id: "regulated-claims",
    level: "hard",
    label: "No health or appeal claim in a regulated trade",
    run({ pages, business }) {
      const rule = regulationFor(business.primary_type);
      if (!rule) return ok("Not a regulated category.");

      // Unlike the general claim gate, there is no "unless the evidence says
      // so" escape here. No evidence this tool can ever hold would support a
      // health claim about tobacco or alcohol, so the plan having made the
      // claim is not a defence.
      const patterns = [
        { id: "health", re: /\b(?:healthy|healthier|good for you|wellness|therapeutic|medicinal|detox|antioxidant|heart[-\s]healthy)\b/gi },
        { id: "safety", re: /\b(?:safer|safe to|less harmful|harm[-\s]free|mild(?:er)? on|easy on the lungs|smoke[-\s]free benefits|no side effects)\b/gi },
        { id: "performance", re: /\b(?:makes you more|boosts your|improves your (?:focus|performance|confidence)|unwind and heal|cures)\b/gi },
        { id: "quantity", re: /\b(?:bottomless|unlimited (?:drinks|pours|refills)|all you can drink|drink (?:till|until) you)\b/gi },
      ];

      const hits = [];
      for (const page of pages) {
        const text = loose(visibleProse(page.html));
        for (const { id, re } of patterns) {
          for (const m of text.matchAll(re)) {
            hits.push({ page: page.file, id, phrase: m[0], where: context(text, m.index) });
          }
        }
      }
      return hits.length === 0
        ? ok(`Regulated as ${rule.label}; no health, safety or quantity claim found.`)
        : bad(`A ${rule.label} business cannot make these claims, whatever the plan said.`, hits);
    },
  },
  {
    id: "phone-numbers",
    level: "hard",
    label: "Only the real phone number appears",
    run({ pages, business }) {
      const mine = digitsOf(business.phone);
      const hits = [];
      for (const page of pages) {
        for (const m of page.html.matchAll(/(?:tel:)?(\+?1?[\s().-]*\d{3}[\s().-]*\d{3}[\s().-]*\d{4})\b/g)) {
          const d = digitsOf(m[1]).replace(/^1(?=\d{10}$)/, "");
          if (d.length === 10 && mine && d !== mine.replace(/^1(?=\d{10}$)/, "")) {
            hits.push({ page: page.file, found: m[1].trim() });
          }
        }
      }
      return hits.length === 0
        ? ok(mine ? `Only ${business.phone} appears.` : "No phone number on file to check against.")
        : bad("A phone number that is not this business's appears on the site.", hits);
    },
  },
  {
    id: "self-contained",
    level: "hard",
    label: "No external resources",
    run({ pages }) {
      const hits = [];
      for (const page of pages) {
        for (const m of page.html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)=["'](https?:|\/\/)[^"']*/gi)) {
          // A plain <a href="https://..."> is a link, not a resource load.
          hits.push({ page: page.file, tag: m[1].toLowerCase(), ref: m[0].slice(0, 120) });
        }
        for (const m of page.html.matchAll(/@import\s+url\(["']?(https?:|\/\/)/gi)) {
          hits.push({ page: page.file, tag: "@import", ref: m[0] });
        }
      }
      return hits.length === 0
        ? ok("Every page loads only what is inside it.")
        : bad("A page loads something from outside itself; the preview policy blocks it.", hits);
    },
  },
  {
    id: "mustnotsay",
    level: "hard",
    label: "Nothing from the brief's mustNotSay list",
    run({ pages, brief }) {
      const banned = (brief?.positioning?.mustNotSay ?? []).filter((s) => typeof s === "string" && s.length > 3);
      if (banned.length === 0) return ok("The brief listed nothing to avoid.");
      const hits = [];
      for (const page of pages) {
        const text = loose(visibleProse(page.html));
        for (const phrase of banned) {
          if (text.includes(loose(phrase))) hits.push({ page: page.file, phrase });
        }
      }
      return hits.length === 0 ? ok(`${banned.length} banned phrase(s) checked.`) : bad("The site says something the brief ruled out.", hits);
    },
  },
  {
    id: "primary-action",
    level: "warn",
    label: "The conversion action is on every page",
    run({ pages, plan, brief }) {
      const href = plan.primaryAction?.href;
      if (!href) return bad("The plan has no primary action.");
      const goal = brief?.conversionGoal ?? "call";
      const missing = pages
        .filter((p) => !p.html.includes(href))
        .map((p) => p.file);
      // Above the fold is approximated by position: the first third of the
      // body, which is as close as a static check can honestly get.
      const buried = pages
        .filter((p) => {
          const i = p.html.indexOf(href);
          const body = p.html.indexOf("<body");
          return i > -1 && body > -1 && (i - body) / Math.max(1, p.html.length - body) > 0.5;
        })
        .map((p) => p.file);
      if (missing.length > 0) return bad(`The "${goal}" action is missing from ${missing.join(", ")}.`, missing);
      if (buried.length > 0) return bad(`The "${goal}" action appears only low on ${buried.join(", ")}.`, buried);
      return ok(`"${goal}" via ${href}, present on all ${pages.length} page(s).`);
    },
  },
  {
    id: "placeholders-survive",
    level: "warn",
    label: "Unfinished spots are still marked",
    run({ pages, plan }) {
      const expected = (plan.pages ?? []).flatMap((p) =>
        (p.sections ?? []).flatMap((s) => (s.placeholders ?? []).map(() => p.slug)),
      );
      if (expected.length === 0) return ok("The plan has no placeholders.");
      const counts = {};
      for (const page of pages) {
        counts[page.slug] = (page.html.match(/\[\[ADD/g) ?? []).length;
      }
      const short = Object.entries(counts).filter(([slug]) => expected.includes(slug) && (counts[slug] ?? 0) === 0);
      return short.length === 0
        ? ok(`${Object.values(counts).reduce((a, b) => a + b, 0)} placeholder(s) visible.`)
        : bad(`Placeholders were planned but rendered as finished copy on: ${short.map(([s]) => s).join(", ")}.`, short.map(([s]) => s));
    },
  },
  {
    id: "accessibility",
    level: "warn",
    label: "Structure and labelling",
    run({ pages }) {
      const problems = [];
      for (const page of pages) {
        const html = page.html;
        // [^>]* not [^>]+: in `<html lang="en">` the single space before lang
        // is the only character there is, and a + would eat it.
        if (!/<html\b[^>]*\slang=/i.test(html)) problems.push({ page: page.file, problem: "no lang on <html>" });

        const h1s = html.match(/<h1\b/gi)?.length ?? 0;
        if (h1s !== 1) problems.push({ page: page.file, problem: `${h1s} <h1> elements (want exactly 1)` });

        const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
        for (let i = 1; i < levels.length; i += 1) {
          if (levels[i] - levels[i - 1] > 1) {
            problems.push({ page: page.file, problem: `heading jumps h${levels[i - 1]} to h${levels[i]}` });
            break;
          }
        }

        for (const landmark of ["main", "header", "footer"]) {
          if (!new RegExp(`<${landmark}[\\s>]`, "i").test(html)) {
            problems.push({ page: page.file, problem: `no <${landmark}>` });
          }
        }

        const controls = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)].filter(
          (m) => !/type=["'](hidden|submit|button|image|reset)["']/i.test(m[0]),
        );
        for (const control of controls) {
          const tag = control[0];
          const id = /\bid=["']([^"']+)/i.exec(tag)?.[1];
          const labelled =
            /aria-label(?:ledby)?=/i.test(tag) ||
            /\btitle=/i.test(tag) ||
            (id && new RegExp(`<label[^>]+for=["']${id}["']`, "i").test(html));
          if (!labelled) problems.push({ page: page.file, problem: `unlabelled <${control[1]}>` });
        }

        if (!/:focus(-visible)?\b/i.test(html)) problems.push({ page: page.file, problem: "no visible focus style" });
      }
      return problems.length === 0 ? ok("Landmarks, heading order, labels and focus all present.") : bad(`${problems.length} issue(s).`, problems);
    },
  },
  {
    id: "technical",
    level: "warn",
    label: "Head, links and weight",
    run({ pages, business, seo }) {
      const problems = [];
      for (const page of pages) {
        const html = page.html;
        const meta = seo?.pages?.find((p) => p.slug === page.slug);

        if (!/<meta[^>]+name=["']viewport["']/i.test(html)) problems.push({ page: page.file, problem: "no viewport meta" });

        const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
        if (title.length < 10) problems.push({ page: page.file, problem: `title is ${title.length} characters` });
        if (title.length > 65) problems.push({ page: page.file, problem: `title is ${title.length} characters (truncates in results)` });

        const desc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(html)?.[1] ?? "";
        if (!desc) problems.push({ page: page.file, problem: "no meta description" });
        else if (desc.length < 50 || desc.length > 160) problems.push({ page: page.file, problem: `meta description is ${desc.length} characters` });

        if (business.phone && !/href=["']tel:/i.test(html)) problems.push({ page: page.file, problem: "no tel: link" });
        // The listing's own URL first. A cid link like maps.google.com/?cid=1
        // has no /maps path, so a path-shaped pattern alone misses the exact
        // link the plan was told to use.
        if (business.google_maps_uri) {
          const linked =
            html.includes(business.google_maps_uri) ||
            /maps\.google\.[a-z.]+|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(html);
          if (!linked) problems.push({ page: page.file, problem: "no map link" });
        }

        const kb = Math.round(Buffer.byteLength(html) / 1024);
        if (kb > 400) problems.push({ page: page.file, problem: `${kb} KB on one page` });

        if (meta && title !== meta.title) problems.push({ page: page.file, problem: "title does not match the SEO stage's" });
      }
      return problems.length === 0 ? ok("Titles, descriptions, links and weight all within budget.") : bad(`${problems.length} issue(s).`, problems);
    },
  },
  {
    id: "schema-present",
    level: "warn",
    label: "LocalBusiness JSON-LD on the home page",
    run({ pages }) {
      const home = pages.find((p) => p.slug === "index");
      if (!home) return bad("No index page.");
      const block = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i.exec(home.html)?.[1];
      if (!block) return bad("No JSON-LD on the home page.");
      try {
        const node = JSON.parse(block);
        if (!node["@type"]) return bad("JSON-LD has no @type.");
        if (node.aggregateRating && !node.aggregateRating.reviewCount) {
          return bad("JSON-LD has a rating with no review count, which Google rejects.");
        }
        return ok(`${node["@type"]}, valid JSON.`);
      } catch (err) {
        return bad(`JSON-LD does not parse: ${err.message}`);
      }
    },
  },
  {
    id: "design-tokens",
    level: "warn",
    label: "The design system was used, not approximated",
    run({ pages, brief }) {
      const home = pages.find((p) => p.slug === "index") ?? pages[0];
      const css = (home.html.match(/<style[\s\S]*?<\/style>/gi) ?? []).join("\n");
      const problems = [];

      const tokens = new Set((css.match(/--[a-z0-9-]+\s*:/gi) ?? []).map((t) => t.trim()));
      if (tokens.size < 6) problems.push(`only ${tokens.size} custom propert(ies) defined - the system's tokens were not carried over`);
      if (!/@media\b/.test(css)) problems.push("no media query, so the layout is not responsive by design");

      for (const override of brief?.artDirection?.paletteOverride ?? []) {
        if (override.hex && !css.toLowerCase().includes(override.hex.toLowerCase())) {
          problems.push(`palette override ${override.hex} (${override.role}) never appears in the CSS`);
        }
      }
      return problems.length === 0 ? ok(`${tokens.size} tokens, responsive, overrides honoured.`) : bad(problems.join("; "), problems);
    },
  },
];

/**
 * Run every gate.
 *
 * `hardFails` is what blocks a publish. `score` is only the warn-level pass
 * rate, deliberately: a number that mixes "the site names a reviewer" with
 * "the meta description is four characters long" is a number nobody can act on.
 */
export function runQa({ business, plan, brief = null, seo = null, pages }) {
  const evidence = buildEvidence(business);
  const reviews = evidence.content.reviews ?? [];

  const ctx = {
    business,
    plan,
    brief,
    seo,
    pages,
    reviews,
    planText: loose(JSON.stringify(plan)),
    // Everything the generator was allowed to see, as one haystack, spelled the
    // same way the page text is spelled.
    evidenceText: loose(
      [
        JSON.stringify(evidence.facts),
        evidence.content.editorialSummary ?? "",
        evidence.content.ownerNotes ?? "",
        reviews.map((r) => r.text).join("\n"),
        // The claim and its proof, so the positioning the brief decided can
        // appear on the page. Deliberately NOT mustNotSay: putting the banned
        // phrases in the same haystack would exempt every one of them from the
        // claim gate and leave the two checks entangled.
        brief
          ? JSON.stringify({
              claim: brief.positioning?.claim,
              proof: brief.positioning?.proof,
              parity: brief.positioning?.parity,
            })
          : "",
      ].join("\n"),
    ),
  };

  const results = GATES.map((gate) => {
    let outcome;
    try {
      outcome = gate.run(ctx);
    } catch (err) {
      // A gate that throws is a bug in the gate, not a failure of the site.
      outcome = { pass: false, detail: `Gate error: ${err.message}`, items: [], errored: true };
    }
    return { id: gate.id, level: gate.level, label: gate.label, ...outcome };
  });

  const hardFails = results.filter((r) => r.level === "hard" && !r.pass);
  const warnings = results.filter((r) => r.level === "warn" && !r.pass);
  const warnTotal = results.filter((r) => r.level === "warn").length;

  return {
    ranAt: new Date().toISOString(),
    pages: pages.length,
    gates: results,
    hardFails: hardFails.map((r) => ({ id: r.id, label: r.label, detail: r.detail, items: r.items ?? [] })),
    warnings: warnings.map((r) => ({ id: r.id, label: r.label, detail: r.detail, items: r.items ?? [] })),
    publishable: hardFails.length === 0,
    score: warnTotal === 0 ? null : Math.round(((warnTotal - warnings.length) / warnTotal) * 100),
  };
}

export const QA_GATE_IDS = GATES.map((g) => g.id);
export { CLAIM_PATTERNS };
