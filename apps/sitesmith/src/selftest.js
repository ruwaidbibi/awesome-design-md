/**
 * Deterministic checks that need no API key and no network.
 * Run with: npm run check
 */
import assert from "node:assert/strict";
import { classifyByHost, looksParked, scoreBusiness, socialPlatform } from "./pipeline/classify.js";
import { extractHtml } from "./generate/generator.js";
import { listDesigns, readDesign } from "./generate/designs.js";
import { createRouter } from "./http.js";
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

console.log("\ndesign systems");
check("the repo's DESIGN.md collection is indexed", () =>
  assert.ok(listDesigns().length > 0, "no DESIGN.md folders found - is this app still inside the repo?"));
check("a design can be read", () =>
  assert.ok(readDesign(listDesigns()[0].key).markdown.length > 100));
check("path traversal in a design key is refused", () =>
  assert.throws(() => readDesign("../../etc")));

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
