/**
 * Deterministic checks that need no API key and no network.
 * Run with: npm run check
 */
import assert from "node:assert/strict";
import { alternateUrl, classifyByHost, looksParked, scoreBusiness, socialPlatform } from "./pipeline/classify.js";
import { extractHtml, extractMain, extractShell } from "./generate/renderer.js";
import { planHonoursBrief, validateBrief, validatePlan, weakSections } from "./generate/schema.js";
import { listDesigns, readDesign } from "./generate/designs.js";
import { createRouter } from "./http.js";
import { CATEGORIES, CITIES, findCity, METRO, withinMetro } from "./geo.js";
import { detailsAreStale, DETAILS_TTL_DAYS } from "./pipeline/freshness.js";
import { slugify } from "./publish.js";
import { distanceKm, profileHtml, summarizeRivals } from "./research/competitors.js";
import { customerVocabulary, nameAnalysis } from "./research/brand.js";
import {
  localBusinessJsonLd,
  metaFor,
  parseAddress,
  queryPatterns,
  schemaTypeFor,
} from "./research/localseo.js";
import { applySeo, buildSeo, sitemapXml } from "./generate/seo.js";
import { longestSharedRun, runQa, visibleWords } from "./generate/qa.js";

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

console.log("\nwebsite classification");
check("an empty website field is the strongest signal", () =>
  assert.equal(classifyByHost(null).status, "none"));
check("a facebook page is not a website", () =>
  assert.equal(classifyByHost("https://www.facebook.com/x").status, "social_only"));
check("subdomains of social hosts still count", () =>
  assert.equal(socialPlatform("https://m.facebook.com/x"), "facebook"));
check("a yelp listing is not a website", () =>
  assert.equal(classifyByHost("https://www.yelp.com/biz/x").status, "directory_only"));
check("an ordering funnel is not a website", () =>
  assert.equal(classifyByHost("https://order.online/x").status, "directory_only"));
check("an unknown host has to be fetched before judging", () =>
  assert.equal(classifyByHost("https://verastortilleria.com"), null));

check("a www host has its apex tried as the alternate", () =>
  assert.equal(alternateUrl("https://www.example.com/x"), "https://example.com/x"));
check("an apex host has its www tried as the alternate", () =>
  assert.equal(alternateUrl("https://example.com/"), "https://www.example.com/"));
check("a malformed URL has no alternate", () => assert.equal(alternateUrl("not a url"), null));

console.log("\nparked-page detection");
check("a for-sale title is parked", () =>
  assert.equal(looksParked("<title>Buy this domain</title><body>x</body>", "http://a.com").parked, true));
check("a title that is just the domain is parked", () =>
  assert.equal(looksParked(`<title>a.com</title><body>${"x ".repeat(400)}</body>`, "http://a.com").parked, true));
check("a real page is not parked", () =>
  assert.equal(
    looksParked(`<title>Vera's Tortilleria</title><body>${"Handmade corn tortillas daily. ".repeat(30)}</body>`, "http://a.com").parked,
    false));
check("'coming soon' deep in a real page is not parked", () =>
  assert.equal(
    looksParked(`<title>Vera's</title><body>${"Real content here. ".repeat(120)} Our new menu is coming soon.</body>`, "http://a.com").parked,
    false));

console.log("\nscoring");
check("no website outranks an identical business that has one", () => {
  const base = { review_count: 300, rating: 4.6, phone: "x", business_status: "OPERATIONAL" };
  const gap = scoreBusiness({ ...base, website_status: "none" }, {}).score;
  const live = scoreBusiness({ ...base, website_status: "live" }, {}).score;
  assert.ok(gap > live, `${gap} should beat ${live}`);
});
check("more reviews scores higher", () => {
  const of = (n) => scoreBusiness({ review_count: n, rating: 4.5, website_status: "none" }, {}).score;
  assert.ok(of(800) > of(200));
});
check("a closed business is penalised", () =>
  assert.ok(
    scoreBusiness({ review_count: 500, rating: 4.8, website_status: "none", business_status: "CLOSED_PERMANENTLY" }, {}).score <
    scoreBusiness({ review_count: 500, rating: 4.8, website_status: "none", business_status: "OPERATIONAL" }, {}).score));
check("every term is explained", () => {
  const { breakdown } = scoreBusiness({ review_count: 250, rating: 4.4, website_status: "none" }, {});
  assert.ok(breakdown.every((t) => t.label && t.detail != null));
});

console.log("\nHTML extraction");
check("strips a fenced block", () =>
  assert.equal(extractHtml("```html\n<!DOCTYPE html><html>a</html>\n```"), "<!DOCTYPE html><html>a</html>"));
check("strips chatter around the document", () =>
  assert.equal(extractHtml("Sure:\n<!DOCTYPE html><html>b</html>\nEnjoy!"), "<!DOCTYPE html><html>b</html>"));
check("passes a bare document through", () =>
  assert.equal(extractHtml("<html>c</html>"), "<html>c</html>"));

console.log("\ncontent plans");
const goodPlan = {
  tagline: "t", voice: "v", primaryAction: { label: "Call", href: "tel:+19045550119" },
  ownerTodos: [], claimsAvoided: [],
  pages: [
    { slug: "index", navLabel: "Home", title: "T", purpose: "p", sections: [
      { kind: "hero", heading: "H", body: "b", confidence: "high",
        evidence: [{ source: "google-fact", ref: "address", supports: "location" }] },
      { kind: "about", heading: "Filler", body: "b", confidence: "low",
        evidence: [{ source: "category-norm", supports: "generic" }] },
    ] },
    { slug: "visit", navLabel: "Visit", title: "V", purpose: "p", sections: [
      { kind: "hours", heading: "Hours", body: "b", confidence: "high",
        evidence: [{ source: "google-fact", ref: "hours", supports: "hours" }] },
    ] },
  ],
};
check("a well-formed plan passes", () => assert.deepEqual(validatePlan(goodPlan), []));
check("a plan with no index page is rejected", () => {
  const bad = structuredClone(goodPlan);
  bad.pages[0].slug = "home";
  assert.ok(validatePlan(bad).some((p) => p.includes("index")));
});
check("duplicate page slugs are rejected", () => {
  const bad = structuredClone(goodPlan);
  bad.pages[1].slug = "index";
  assert.ok(validatePlan(bad).some((p) => p.includes("Duplicate")));
});
check("an empty page is rejected", () => {
  const bad = structuredClone(goodPlan);
  bad.pages[1].sections = [];
  assert.ok(validatePlan(bad).some((p) => p.includes("no sections")));
});
check("a slug that would escape the site directory is rejected", () => {
  const bad = structuredClone(goodPlan);
  bad.pages[1].slug = "../../etc/passwd";
  assert.ok(validatePlan(bad).some((p) => p.includes("unusable slug")));
});
check("sections resting only on category norms are flagged as weak", () => {
  const weak = weakSections(goodPlan);
  assert.equal(weak.length, 1);
  assert.equal(weak[0].heading, "Filler");
});
check("evidence-backed sections are not flagged", () =>
  assert.ok(!weakSections(goodPlan).some((w) => w.heading === "Hours")));

console.log("\nmulti-page assembly");
const homeDoc = `<!DOCTYPE html><html lang="en"><head><style>body{color:red}</style></head>
<body><header><nav><a href="index.html">Home</a><a href="services.html">Services</a></nav></header>
<main>home</main><footer>f</footer></body></html>`;
check("the home page yields a reusable shell", () => {
  const shell = extractShell(homeDoc);
  assert.equal(shell.complete, true);
  assert.match(shell.styles, /color:red/);
  assert.match(shell.header, /services\.html/);
});
check("a home page without a footer is not a reusable shell", () =>
  assert.equal(extractShell("<html><head><style>a{}</style></head><body><header>h</header></body></html>").complete, false));
check("a main fragment is extracted from a reply", () =>
  assert.equal(extractMain("Here:\n<main><h1>S</h1></main>\ndone"), "<main><h1>S</h1></main>"));
check("a reply with no main returns null", () => assert.equal(extractMain("no main"), null));

console.log("\ndesign systems");
check("the repo's DESIGN.md collection is indexed", () =>
  assert.ok(listDesigns().length > 0, "no DESIGN.md folders found - is this app still inside the repo?"));
check("a design can be read", () =>
  assert.ok(readDesign(listDesigns()[0].key).markdown.length > 100));
check("path traversal in a design key is refused", () =>
  assert.throws(() => readDesign("../../etc")));

console.log("\ngeographic scope");
check("downtown Jacksonville is inside the fence", () =>
  assert.equal(withinMetro(30.3322, -81.6557), true));
check("the beaches are inside the fence", () =>
  assert.equal(withinMetro(30.2947, -81.3931), true));
check("Fernandina Beach in the north is inside the fence", () =>
  assert.equal(withinMetro(30.6697, -81.4637), true));
check("St. Augustine in the south is inside the fence", () =>
  assert.equal(withinMetro(29.8947, -81.3145), true));
check("Macclenny in the west is inside the fence", () =>
  assert.equal(withinMetro(30.2819, -82.1215), true));
check("Austin is outside the fence", () =>
  assert.equal(withinMetro(30.2672, -97.7431), false));
check("Savannah is outside the fence", () =>
  assert.equal(withinMetro(32.0809, -81.0912), false));
check("Tampa is outside the fence", () =>
  assert.equal(withinMetro(27.9506, -82.4572), false));
check("city lookup is case insensitive", () =>
  assert.equal(findCity("orange park")?.name, "Orange Park"));
check("a city outside the metro does not resolve", () =>
  assert.equal(findCity("Austin"), null));
check("the metro has cities and categories to search", () => {
  assert.ok(CITIES.length >= 10);
  assert.ok(CATEGORIES.length >= 10);
  assert.ok(METRO.bounds.low.latitude < METRO.bounds.high.latitude);
  assert.ok(METRO.bounds.low.longitude < METRO.bounds.high.longitude);
});

console.log("\nreview caching policy");
check("never-fetched details are stale", () =>
  assert.equal(detailsAreStale(null), true));
check("just-fetched details are fresh", () =>
  assert.equal(detailsAreStale(new Date().toISOString()), false));
check(`details older than ${DETAILS_TTL_DAYS} days are stale`, () =>
  assert.equal(detailsAreStale(new Date(Date.now() - (DETAILS_TTL_DAYS + 1) * 86400000).toISOString()), true));
check("details just inside the window are still fresh", () =>
  assert.equal(detailsAreStale(new Date(Date.now() - (DETAILS_TTL_DAYS - 1) * 86400000).toISOString()), false));

console.log("\nplumbing");
check("the router extracts params", () => {
  const r = createRouter();
  r.post("/api/businesses/:id/generate", () => {});
  assert.equal(r.match("POST", "/api/businesses/ChIJ_a-1/generate").params.id, "ChIJ_a-1");
  assert.equal(r.match("GET", "/api/businesses/x/generate"), null);
});
check("slugs are URL safe", () =>
  assert.equal(slugify("Kim's Alterations & Tailoring"), "kims-alterations-and-tailoring"));

/* ------------------------- stage 1: research ----------------------------- */

console.log("\ncompetitive set");
check("distance between two Jacksonville points is a few km", () => {
  const km = distanceKm({ lat: 30.3322, lng: -81.6557 }, { lat: 30.2947, lng: -81.3931 });
  assert.ok(km > 20 && km < 30, `got ${km}`);
});
check("a missing coordinate yields no distance", () =>
  assert.equal(distanceKm({ lat: 30, lng: null }, { lat: 30, lng: -81 }), null));

const rivalHtml = `<!DOCTYPE html><html><head><title>Ace Cuts | Barbershop</title>
<meta name="description" content="Walk-in barbershop downtown.">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>:root{--gold:#c9a227}body{background:#1a1a1a;font-family:"Inter",sans-serif}h1{color:#C9A227}</style></head>
<body><h1>Downtown's Barbershop</h1><h2>Our Services</h2>
<a href="https://booksy.com/ace">Book now</a><p>Cuts from $25. Mon - Fri 9-6.</p>
<div class="gallery">work</div></body></html>`;

console.log("\nreading a rival's homepage");
check("the title and description come out", () => {
  const p = profileHtml(rivalHtml, "https://acecuts.com/");
  assert.equal(p.title, "Ace Cuts | Barbershop");
  assert.equal(p.metaDescription, "Walk-in barbershop downtown.");
});
check("colours are counted case-insensitively and black is ignored", () => {
  const p = profileHtml(rivalHtml, "https://acecuts.com/");
  const gold = p.colors.find((c) => c.hex === "#c9a227");
  assert.equal(gold.count, 2, "the same hex in two cases is one colour");
  assert.ok(!p.colors.some((c) => c.hex === "#ffffff"));
});
check("an explicit webfont load outranks a CSS fallback", () =>
  assert.equal(profileHtml(rivalHtml, "https://acecuts.com/").fonts[0], "Playfair Display"));
check("booking, prices, services and a gallery are all detected", () => {
  const f = profileHtml(rivalHtml, "https://acecuts.com/").features;
  for (const want of ["booking", "prices", "services", "gallery", "hours"]) {
    assert.ok(f.includes(want), `missed ${want}`);
  }
});
check("navigation words are not mistaken for claims", () =>
  assert.ok(!profileHtml("<h2>Home</h2><h2>Contact</h2>", "https://a.com").headings.length));

console.log("\nwhat the rivals have in common");
const fakeProfile = (features, colors, fonts) => ({
  url: "https://x.com", host: "x.com", title: "t", metaDescription: null, headings: [],
  colors: colors.map((hex) => ({ hex, count: 3 })), fonts, features, bytes: 100,
});
check("a feature a majority have is table stakes", () => {
  const s = summarizeRivals([
    fakeProfile(["booking"], ["#c9a227"], ["Playfair Display"]),
    fakeProfile(["booking"], ["#b8860b"], ["Playfair Display"]),
    fakeProfile(["gallery"], ["#2b5fa8"], ["Inter"]),
  ]);
  assert.deepEqual(s.tableStakes.map((t) => t.name), ["booking"]);
});
check("two shades of gold count as the same crowded hue", () => {
  const s = summarizeRivals([
    fakeProfile([], ["#c9a227"], []),
    fakeProfile([], ["#b8860b"], []),
    fakeProfile([], ["#2b5fa8"], []),
  ]);
  assert.deepEqual(s.crowdedHues.map((h) => h.name), ["amber"], JSON.stringify(s.crowdedHues));
});
check("no readable rival means nothing is asserted about them", () => {
  const s = summarizeRivals([{ url: "https://x.com", error: "HTTP 403" }]);
  assert.equal(s.basis, "not-researched");
  assert.equal(s.tableStakes, null);
});

console.log("\nbrand signals");
check("the trading name is split from the Google suffix", () => {
  const n = nameAnalysis("Blessed Hands Barber Parlor | Jovanni The Barber");
  assert.equal(n.trading, "Blessed Hands Barber Parlor");
  assert.equal(n.suffix, "Jovanni The Barber");
});
check("'parlor' and a faith reference are both picked up", () => {
  const n = nameAnalysis("Blessed Hands Barber Parlor");
  assert.equal(n.signals.length >= 2, true, JSON.stringify(n.signals));
});
check("a long name needs a stacked wordmark", () =>
  assert.match(nameAnalysis("Blessed Hands Barber Parlor").wordmarkNote, /stacked/));
check("a word used by one reviewer is not a signal", () => {
  const vocab = customerVocabulary([
    { text: "The lineup was sharp and the fade was clean" },
    { text: "Great fade every time, sharp lineup" },
    { text: "Something entirely idiosyncratic" },
  ]);
  const words = vocab.map((v) => v.word);
  assert.ok(words.includes("fade") && words.includes("sharp"));
  assert.ok(!words.includes("idiosyncratic"), "a single mention should not survive");
});
check("stopwords and review boilerplate are dropped", () => {
  const words = customerVocabulary([
    { text: "Highly recommend this place, amazing service" },
    { text: "Highly recommend, amazing service here" },
  ]).map((v) => v.word);
  for (const noise of ["highly", "recommend", "amazing", "service", "this", "here"]) {
    assert.ok(!words.includes(noise), `${noise} should be filtered`);
  }
});

console.log("\nlocal SEO");
check("a US address parses into its parts", () => {
  const a = parseAddress("1234 N Main St, Jacksonville, FL 32206, USA");
  assert.equal(a.street, "1234 N Main St");
  assert.equal(a.city, "Jacksonville");
  assert.equal(a.state, "FL");
  assert.equal(a.postalCode, "32206");
  assert.equal(a.country, "US");
});
check("an address it cannot parse yields nulls, not guesses", () => {
  const a = parseAddress("somewhere");
  assert.equal(a.full, "somewhere");
  assert.equal(a.state, null);
  assert.equal(a.postalCode, null);
});
check("a barbershop is a HairSalon, not a LocalBusiness", () =>
  assert.equal(schemaTypeFor("barber_shop"), "HairSalon"));
check("an unmapped category falls back to LocalBusiness", () =>
  assert.equal(schemaTypeFor("something_new"), "LocalBusiness"));
check("query patterns are de-duplicated and include branded intent", () => {
  const qs = queryPatterns({ name: "K Cuts", primary_type: "barber_shop", city: "Jacksonville", address: "1 Main St, Jacksonville, FL 32206, USA" });
  assert.equal(new Set(qs.map((q) => q.query)).size, qs.length);
  assert.ok(qs.some((q) => q.intent === "branded"));
  assert.ok(qs.some((q) => q.query === "barber near me"));
});

const fixtureBusiness = {
  id: "ChIJtestplace000000",
  name: "K Cuts Barbershop",
  address: "1234 N Main St, Jacksonville, FL 32206, USA",
  lat: 30.3522,
  lng: -81.6557,
  phone: "(904) 555-0119",
  rating: 5,
  review_count: 317,
  primary_type: "barber_shop",
  types_json: '["barber_shop"]',
  hours_json: '["Monday: 9 AM - 6 PM","Tuesday: 9 AM - 6 PM"]',
  google_maps_uri: "https://maps.google.com/?cid=1",
  website_status: "none",
  reviews_json: JSON.stringify([
    { text: "Best fade in Jacksonville, I have been coming here for years and the lineup is always sharp.", author: "Marcus Webb", rating: 5 },
    { text: "Clean shop, quick wait, great with my son's first haircut.", author: "Dana Reyes", rating: 5 },
  ]),
  details_fetched_at: new Date().toISOString(),
  city: "Jacksonville",
  notes: null,
  socials_json: null,
  vision_json: null,
  price_level: null,
};

check("JSON-LD carries the rating only with its count", () => {
  const withBoth = localBusinessJsonLd(fixtureBusiness);
  assert.equal(withBoth.aggregateRating.reviewCount, 317);
  const noCount = localBusinessJsonLd({ ...fixtureBusiness, review_count: 0 });
  assert.equal(noCount.aggregateRating, undefined);
});
check("JSON-LD omits what we do not hold", () => {
  const node = localBusinessJsonLd({ ...fixtureBusiness, phone: null, lat: null, lng: null });
  assert.equal(node.telephone, undefined);
  assert.equal(node.geo, undefined);
});
check("a long title is clamped under the budget", () => {
  const meta = metaFor({
    business: { ...fixtureBusiness, name: "The Extremely Long Barbershop Name Of Jacksonville Florida" },
    page: { slug: "index", navLabel: "Home", title: "x" },
    tagline: "A sharp cut, every time",
  });
  assert.ok(meta.title.length <= 60, `${meta.title.length}: ${meta.title}`);
});

/* ------------------------- stage 5: SEO ---------------------------------- */

const planFixture = {
  tagline: "A sharp cut, every time",
  voice: "plain",
  primaryAction: { label: "Call the shop", href: "tel:+19045550119" },
  ownerTodos: [],
  claimsAvoided: [],
  pages: [
    { slug: "index", navLabel: "Home", title: "K Cuts", purpose: "Get the call", sections: [
      { kind: "hero", heading: "Walk in", body: "b", confidence: "high",
        evidence: [{ source: "google-fact", ref: "address", supports: "location" }] },
    ] },
    { slug: "visit", navLabel: "Visit", title: "Visit", purpose: "Get them through the door", sections: [
      { kind: "hours", heading: "Hours", body: "b", confidence: "high",
        evidence: [{ source: "google-fact", ref: "hours", supports: "hours" }] },
    ] },
  ],
};

console.log("\nSEO application");
const seoFixture = buildSeo({ business: fixtureBusiness, plan: planFixture });
check("every page gets a title and a description", () => {
  assert.equal(seoFixture.pages.length, 2);
  assert.ok(seoFixture.pages.every((p) => p.title && p.description));
});
check("the home page carries the LocalBusiness node", () =>
  assert.equal(seoFixture.jsonLd["@type"], "HairSalon"));
check("no deployment URL means no canonical", () => {
  assert.equal(seoFixture.pages[0].canonical, null);
  assert.ok(seoFixture.note.includes("canonical"));
});

const bareDoc = `<!DOCTYPE html><html lang="en"><head><title>Old title</title>
<meta name="description" content="model wrote this"></head><body><main>hi</main></body></html>`;

check("applying SEO replaces the title and the model's description", () => {
  const out = applySeo(bareDoc, { business: fixtureBusiness, page: seoFixture.pages[0], jsonLd: seoFixture.jsonLd });
  assert.ok(out.includes(`<title>${seoFixture.pages[0].title}</title>`));
  assert.equal((out.match(/name="description"/g) ?? []).length, 1);
  assert.ok(!out.includes("model wrote this"));
});
check("applying SEO twice leaves exactly one block", () => {
  const once = applySeo(bareDoc, { business: fixtureBusiness, page: seoFixture.pages[0], jsonLd: seoFixture.jsonLd });
  const twice = applySeo(once, { business: fixtureBusiness, page: seoFixture.pages[0], jsonLd: seoFixture.jsonLd });
  assert.equal((twice.match(/leadsites:seo/g) ?? []).length, 2, "one open and one close marker");
  assert.equal((twice.match(/application\/ld\+json/g) ?? []).length, 1);
});
check("the sitemap uses absolute URLs and drops index.html", () => {
  const xml = sitemapXml("https://example.com/published/k-cuts", seoFixture.pages);
  assert.ok(xml.includes("<loc>https://example.com/published/k-cuts/</loc>"));
  assert.ok(xml.includes("<loc>https://example.com/published/k-cuts/visit.html</loc>"));
});

/* ------------------------- stage 2: the brief ---------------------------- */

const briefFixture = {
  conversionGoal: "call",
  conversionRationale: "Walk-in trade decides on the phone.",
  audiences: [{ who: "Local regulars", intentState: "loyal", needsToSee: "that it is open" }],
  positioning: {
    claim: "The shop downtown that gets the fade right first time.",
    proof: "317 reviews at 5.0, the highest count of any shop scanned within 8km.",
    parity: ["experienced barbers"],
    mustNotSay: ["friendly service", "award-winning"],
  },
  voice: { register: "Plain and direct.", tagline: "A sharp cut, every time", dos: ["be specific"], donts: ["gush"] },
  artDirection: {
    designKey: listDesigns()[0]?.key ?? "ferrari",
    designRationale: "Four of five rivals use dark walls with a gold accent, so this takes the opposite route.",
    typeRegister: "condensed grotesque headings",
    layoutArchetype: "split-hero",
    imageStrategy: "type-and-colour-only",
    wordmark: { treatment: "Name set in the display face, stacked over two lines." },
  },
  navigation: [
    { label: "Home", slug: "index", why: "Carries the call" },
    { label: "Visit", slug: "visit", why: "Hours and directions" },
  ],
};

console.log("\nthe creative brief");
check("a well-formed brief passes", () =>
  assert.deepEqual(validateBrief(briefFixture, { designKeys: listDesigns().map((d) => d.key) }), []));
check("a design system that does not exist is rejected", () => {
  const bad = structuredClone(briefFixture);
  bad.artDirection.designKey = "not-a-real-design";
  assert.ok(validateBrief(bad, { designKeys: listDesigns().map((d) => d.key) }).some((p) => p.includes("does not exist")));
});
check("a design chosen without a real rationale is rejected", () => {
  const bad = structuredClone(briefFixture);
  bad.artDirection.designRationale = "looks nice";
  assert.ok(validateBrief(bad).some((p) => p.includes("rationale")));
});
check("a palette override that is not a hex is rejected", () => {
  const bad = structuredClone(briefFixture);
  bad.artDirection.paletteOverride = [{ role: "accent", hex: "goldish", why: "observed" }];
  assert.ok(validateBrief(bad).some((p) => p.includes("hex")));
});
check("a positioning claim with no stated proof is rejected", () => {
  const bad = structuredClone(briefFixture);
  delete bad.positioning.proof;
  assert.ok(validateBrief(bad).some((p) => p.includes("proof")));
});

console.log("\ndoes the plan honour the brief");
check("a plan that matches the brief shows no drift", () =>
  assert.deepEqual(planHonoursBrief(planFixture, briefFixture), []));
check("a page the brief did not ask for is drift", () => {
  const extra = structuredClone(planFixture);
  extra.pages.push({ slug: "team", navLabel: "Team", title: "T", purpose: "p", sections: [{ kind: "about", heading: "h", body: "b", confidence: "low", evidence: [] }] });
  assert.ok(planHonoursBrief(extra, briefFixture).some((p) => p.includes("team")));
});
check("a primary action that does not serve the conversion goal is drift", () => {
  const wrong = structuredClone(planFixture);
  wrong.primaryAction.href = "#contact";
  assert.ok(planHonoursBrief(wrong, briefFixture).some((p) => /conversion goal/i.test(p)));
});
check("a mustNotSay phrase reaching the plan is drift", () => {
  const slipped = structuredClone(planFixture);
  slipped.pages[0].sections[0].body = "Expect friendly service every visit.";
  assert.ok(planHonoursBrief(slipped, briefFixture).some((p) => p.includes("mustNotSay")));
});

/* ------------------------- stage 6: QA ----------------------------------- */

console.log("\nverbatim-reuse detection");
check("script and style contents are not visible text", () =>
  assert.deepEqual(visibleWords("<style>body{color:red}</style><p>Hello there</p>"), ["hello", "there"]));
check("a copied sentence is caught", () => {
  const { length, sample } = longestSharedRun(
    "<p>I have been coming here for years and the lineup is always sharp.</p>",
    "Best fade in Jacksonville, I have been coming here for years and the lineup is always sharp.",
  );
  assert.ok(length >= 5, `found only a ${length}-word run`);
  assert.ok(sample.includes("coming here for years"));
});
check("original prose about the same subject is clean", () => {
  const { length } = longestSharedRun(
    "<p>Fades are the house speciality. Most customers are regulars.</p>",
    "Best fade in Jacksonville, I have been coming here for years and the lineup is always sharp.",
  );
  assert.ok(length < 5, `shared a ${length}-word run`);
});

const cleanPage = (slug, body) => ({
  slug,
  file: slug === "index" ? "index.html" : `${slug}.html`,
  title: seoFixture.pages.find((p) => p.slug === slug)?.title ?? "t",
  html: applySeo(
    `<!DOCTYPE html><html lang="en"><head><title>x</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{--ink:#111;--paper:#faf7f2;--accent:#1d4ed8;--space:1rem;--radius:4px;--measure:60ch}
a:focus-visible{outline:2px solid var(--accent)}@media (min-width:40rem){main{padding:2rem}}</style></head>
<body><header><nav><a href="index.html">Home</a><a href="visit.html">Visit</a></nav>
<a href="tel:+19045550119">Call the shop</a></header>
${body}
<footer><a href="https://maps.google.com/?cid=1">Directions</a></footer></body></html>`,
    {
      business: fixtureBusiness,
      page: seoFixture.pages.find((p) => p.slug === slug) ?? seoFixture.pages[0],
      jsonLd: slug === "index" ? seoFixture.jsonLd : null,
    },
  ),
});

const cleanPages = [
  cleanPage("index", "<main><h1>K Cuts Barbershop</h1><h2>Walk in</h2><p>Fades are the house speciality.</p></main>"),
  cleanPage("visit", "<main><h1>Visit K Cuts</h1><h2>Hours</h2><p>Open Monday to Saturday.</p></main>"),
];

const qaOf = (pages, overrides = {}) =>
  runQa({ business: fixtureBusiness, plan: planFixture, brief: briefFixture, seo: seoFixture, pages, ...overrides });

const gate = (qa, id) => qa.gates.find((g) => g.id === id);

console.log("\nQA gates");
check("a clean site passes every hard gate", () => {
  const qa = qaOf(cleanPages);
  assert.deepEqual(qa.hardFails.map((f) => f.id), [], JSON.stringify(qa.hardFails, null, 2));
  assert.equal(qa.publishable, true);
});
check("a clean site reports an advisory score", () => {
  const qa = qaOf(cleanPages);
  assert.ok(qa.score != null && qa.score >= 0 && qa.score <= 100);
});
check("review wording on a page is a hard fail", () => {
  const dirty = [cleanPage("index", "<main><h1>K Cuts</h1><p>I have been coming here for years and the lineup is always sharp.</p></main>"), cleanPages[1]];
  const qa = qaOf(dirty);
  assert.equal(gate(qa, "no-review-text").pass, false);
  assert.equal(qa.publishable, false);
});
check("naming a reviewer is a hard fail", () => {
  const dirty = [cleanPage("index", "<main><h1>K Cuts</h1><p>Marcus Webb has trusted us for a while.</p></main>"), cleanPages[1]];
  assert.equal(gate(qaOf(dirty), "no-reviewer-names").pass, false);
});
check("a credential nobody gave us is a hard fail", () => {
  const dirty = [cleanPage("index", "<main><h1>K Cuts</h1><p>Fully licensed and insured barbers.</p></main>"), cleanPages[1]];
  const g = gate(qaOf(dirty), "unsupported-claims");
  assert.equal(g.pass, false);
  assert.ok(g.items.some((i) => i.id === "credentials"), JSON.stringify(g.items));
});
check("a founding year nobody gave us is a hard fail", () => {
  const dirty = [cleanPage("index", "<main><h1>K Cuts</h1><p>Cutting hair since 1974.</p></main>"), cleanPages[1]];
  assert.ok(gate(qaOf(dirty), "unsupported-claims").items.some((i) => i.id === "founding-year"));
});
check("a claim the plan actually made is allowed through", () => {
  const plan = structuredClone(planFixture);
  plan.pages[0].sections[0].body = "Family-owned since the day it opened.";
  const page = [cleanPage("index", "<main><h1>K Cuts</h1><p>Family-owned since the day it opened.</p></main>"), cleanPages[1]];
  const qa = qaOf(page, { plan });
  assert.equal(gate(qa, "unsupported-claims").pass, true, JSON.stringify(gate(qa, "unsupported-claims").items));
});
// Both of these were invisible to a word-level view of the page: stripping
// punctuation deletes the only character that makes them detectable.
check("a price is caught even though '$' is not a word character", () => {
  const dirty = [cleanPage("index", "<main><h1>K Cuts</h1><p>Cuts from $25.</p></main>"), cleanPages[1]];
  assert.ok(gate(qaOf(dirty), "unsupported-claims").items.some((i) => i.id === "prices"));
});
check("an invented email address is caught", () => {
  const dirty = [cleanPage("index", "<main><h1>K Cuts</h1><p>Write to hello@kcuts.com</p></main>"), cleanPages[1]];
  assert.ok(gate(qaOf(dirty), "unsupported-claims").items.some((i) => i.id === "email"));
});
check("a hyphen does not defeat the plan-trace check", () => {
  const plan = structuredClone(planFixture);
  plan.pages[0].sections[0].body = "Family owned, no hyphen in the plan.";
  const page = [cleanPage("index", "<main><h1>K Cuts</h1><p>Family-owned, hyphenated on the page.</p></main>"), cleanPages[1]];
  assert.equal(gate(qaOf(page, { plan }), "unsupported-claims").pass, true);
});

check("someone else's phone number is a hard fail", () => {
  const dirty = [cleanPage("index", '<main><h1>K Cuts</h1><p>Call <a href="tel:+18005551234">800-555-1234</a></p></main>'), cleanPages[1]];
  assert.equal(gate(qaOf(dirty), "phone-numbers").pass, false);
});
check("the real phone number in any format is fine", () => {
  const ok = [cleanPage("index", "<main><h1>K Cuts</h1><p>Call 904-555-0119 or 9045550119.</p></main>"), cleanPages[1]];
  assert.equal(gate(qaOf(ok), "phone-numbers").pass, true);
});
check("an external stylesheet is a hard fail", () => {
  const dirty = [
    { ...cleanPages[0], html: cleanPages[0].html.replace("</head>", '<link rel="stylesheet" href="https://cdn.example.com/a.css"></head>') },
    cleanPages[1],
  ];
  assert.equal(gate(qaOf(dirty), "self-contained").pass, false);
});
check("a plain link to Google Maps is not an external resource", () =>
  assert.equal(gate(qaOf(cleanPages), "self-contained").pass, true));
check("a phrase the brief ruled out is a hard fail", () => {
  const dirty = [cleanPage("index", "<main><h1>K Cuts</h1><p>Expect friendly service.</p></main>"), cleanPages[1]];
  assert.equal(gate(qaOf(dirty), "mustnotsay").pass, false);
});
check("a missing h1 is a warning, not a block", () => {
  const sloppy = [cleanPage("index", "<main><h2>No heading one</h2></main>"), cleanPages[1]];
  const qa = qaOf(sloppy);
  assert.equal(gate(qa, "accessibility").pass, false);
  assert.equal(qa.publishable, true, "accessibility must never silently block a publish");
});
check("an unlabelled input is caught", () => {
  const sloppy = [cleanPage("index", '<main><h1>K</h1><form><input type="text" name="q"></form></main>'), cleanPages[1]];
  assert.ok(gate(qaOf(sloppy), "accessibility").items.some((i) => i.problem.includes("unlabelled")));
});
check("the conversion action has to be on every page", () => {
  const missing = [cleanPages[0], { ...cleanPages[1], html: cleanPages[1].html.replace(/tel:\+19045550119/g, "#top") }];
  assert.equal(gate(qaOf(missing), "primary-action").pass, false);
});
check("a page with no token system is flagged", () => {
  const flat = [
    { ...cleanPages[0], html: cleanPages[0].html.replace(/:root\{[^}]*\}/, ":root{--ink:#111}") },
    cleanPages[1],
  ];
  assert.equal(gate(qaOf(flat), "design-tokens").pass, false);
});
check("a palette override that never reached the CSS is flagged", () => {
  const brief = structuredClone(briefFixture);
  brief.artDirection.paletteOverride = [{ role: "accent", hex: "#7f1d1d", why: "observed on the storefront" }];
  assert.ok(gate(qaOf(cleanPages, { brief }), "design-tokens").detail.includes("#7f1d1d"));
});
check("JSON-LD missing from the home page is flagged", () => {
  const stripped = [
    { ...cleanPages[0], html: cleanPages[0].html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "") },
    cleanPages[1],
  ];
  assert.equal(gate(qaOf(stripped), "schema-present").pass, false);
});
check("a gate that throws is reported, not fatal", () => {
  const qa = qaOf([{ ...cleanPages[0], html: null }, cleanPages[1]]);
  assert.ok(qa.gates.some((g) => g.errored), "expected at least one gate to report an error");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
