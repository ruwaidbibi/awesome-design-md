/**
 * Deterministic checks that need no API key and no network.
 * Run with: npm run check
 */
import assert from "node:assert/strict";
import { classifyByHost, looksParked, scoreBusiness, socialPlatform } from "./pipeline/classify.js";
import { extractHtml, extractMain, extractShell } from "./generate/renderer.js";
import { validatePlan, weakSections } from "./generate/schema.js";
import { listDesigns, readDesign } from "./generate/designs.js";
import { createRouter } from "./http.js";
import { CATEGORIES, CITIES, findCity, METRO, withinMetro } from "./geo.js";
import { detailsAreStale, DETAILS_TTL_DAYS } from "./pipeline/freshness.js";
import { slugify } from "./publish.js";

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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
