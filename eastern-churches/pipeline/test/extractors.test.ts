import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSocials, extractFeeds } from "../src/extract/socials.js";
import { parseUsAddress, normalizePhone, normalizeState } from "../src/extract/address.js";
import { readJsonLd, isType, str } from "../src/extract/jsonld.js";
import { parseIcal } from "../src/extract/ical.js";
import { categorize } from "../src/extract/categorize.js";
import { htmlToText } from "../src/extract/html-to-text.js";
import { nameKey, parishId } from "../src/util/slug.js";
import { sameParish } from "../src/util/dedupe.js";

const PARISH_PAGE = `
<html><head>
  <link rel="alternate" type="application/rss+xml" href="/feed/">
</head><body>
  <h1>St. Mary Coptic Orthodox Church</h1>
  <p>427 West Side Ave, Jersey City, NJ 07304</p>
  <p>Phone: (201) 555-0123</p>
  <a href="https://www.facebook.com/stmarycopticjc">Facebook</a>
  <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
  <a href="https://instagram.com/stmary.jc/">Instagram</a>
  <a href="https://www.youtube.com/@StMaryJC">YouTube</a>
  <a href="https://twitter.com/intent/tweet?text=hi">Tweet this</a>
  <a href="/events/calendar.ics">Add to calendar</a>
</body></html>`;

test("social extraction keeps accounts and drops share widgets", () => {
  const found = extractSocials(PARISH_PAGE, "https://stmaryjc.org/");
  const platforms = found.map((f) => f.platform).sort();
  assert.deepEqual(platforms, ["facebook", "instagram", "youtube"]);
  assert.equal(found.find((f) => f.platform === "facebook")?.handle, "stmarycopticjc");
  assert.equal(found.find((f) => f.platform === "instagram")?.handle, "stmary.jc");
  assert.equal(found.find((f) => f.platform === "youtube")?.handle, "StMaryJC");
  // The sharer link and the tweet-intent link must not be mistaken for accounts.
  assert.ok(!found.some((f) => f.url.includes("sharer")));
  assert.ok(!found.some((f) => f.platform === "x"));
});

test("feed extraction finds both the RSS link tag and the .ics anchor", () => {
  const feeds = extractFeeds(PARISH_PAGE, "https://stmaryjc.org/");
  assert.ok(feeds.some((f) => f.type === "rss" && f.url === "https://stmaryjc.org/feed/"));
  assert.ok(feeds.some((f) => f.type === "ical" && f.url.endsWith("calendar.ics")));
});

test("address parsing anchors on CITY, ST ZIP", () => {
  const a = parseUsAddress("427 West Side Ave, Jersey City, NJ 07304");
  assert.equal(a?.state, "NJ");
  assert.equal(a?.city, "Jersey City");
  assert.equal(a?.postalCode, "07304");
  assert.equal(a?.street, "427 West Side Ave");

  // Spelled-out state names resolve too.
  assert.equal(parseUsAddress("1 Main St, Southfield, Michigan 48034")?.state, "MI");
  // Anything without a resolvable state is refused rather than guessed.
  assert.equal(parseUsAddress("Somewhere in the Midwest"), undefined);
  assert.equal(parseUsAddress("25 High St, Springfield, ZZ 99999"), undefined);
});

test("phone and state normalisation", () => {
  assert.equal(normalizePhone("+1 (201) 555-0123"), "(201) 555-0123");
  assert.equal(normalizePhone("201.555.0123"), "(201) 555-0123");
  assert.equal(normalizePhone("555-0123"), undefined);
  assert.equal(normalizeState("california"), "CA");
  assert.equal(normalizeState("Ca"), "CA");
  assert.equal(normalizeState("Narnia"), undefined);
});

test("JSON-LD reading flattens @graph and matches church types", () => {
  const html = `<script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"Church","name":"St. George Antiochian","telephone":"(313) 555-0100",
       "address":{"@type":"PostalAddress","streetAddress":"1 Elm St","addressLocality":"Troy","addressRegion":"MI","postalCode":"48083"}},
      {"@type":"WebSite","name":"ignore me"}
    ]}</script>`;
  const nodes = readJsonLd(html);
  assert.equal(nodes.length, 3); // wrapper + 2 graph nodes
  const church = nodes.find((n) => isType(n, "Church"))!;
  assert.equal(str(church["name"]), "St. George Antiochian");
  assert.equal(str((church["address"] as Record<string, unknown>)["addressRegion"]), "MI");
});

test("malformed JSON-LD is skipped, not thrown", () => {
  assert.deepEqual(readJsonLd(`<script type="application/ld+json">{nope}</script>`), []);
});

test("iCal parsing yields a dated event inside the horizon", () => {
  const soon = new Date(Date.now() + 5 * 864e5);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    "UID:test-1", `DTSTART:${stamp(soon)}`,
    `DTEND:${stamp(new Date(soon.getTime() + 36e5))}`,
    "SUMMARY:Divine Liturgy", "LOCATION:Main Church", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");

  const events = parseIcal(ics, "coptic-nj-mary", {
    source: "test", method: "ical", fetchedAt: new Date().toISOString(), confidence: 0.95,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.title, "Divine Liturgy");
  assert.equal(events[0]!.category, "liturgy");
  assert.equal(events[0]!.parishId, "coptic-nj-mary");
});

test("past events fall outside the horizon", () => {
  const old = new Date(Date.now() - 90 * 864e5);
  const stamp = old.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:${stamp}\r\nSUMMARY:Old Feast\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const events = parseIcal(ics, "p", { source: "t", method: "ical", fetchedAt: new Date().toISOString(), confidence: 1 });
  assert.equal(events.length, 0);
});

test("categorisation spans the traditions in scope", () => {
  assert.equal(categorize("Holy Qurbana"), "liturgy");
  assert.equal(categorize("Midnight Praises (Tasbeha)"), "liturgy");
  assert.equal(categorize("Orthros and Divine Liturgy"), "liturgy");
  assert.equal(categorize("Feast of the Dormition"), "feast");
  assert.equal(categorize("Annual Lebanese Mahrajan"), "festival");
  assert.equal(categorize("Akitu / Assyrian New Year"), "festival");
  assert.equal(categorize("GOYA Basketball Night"), "youth");
  assert.equal(categorize("Parish Council Meeting"), "community");
  assert.equal(categorize("Something unrelated"), "other");
});

test("html-to-text keeps link targets inline", () => {
  const text = htmlToText(
    `<div><a href="https://example.org/parish">St. Anne</a><br>12 Oak St</div>`,
    "https://directory.example/",
  );
  assert.match(text, /St\. Anne <https:\/\/example\.org\/parish>/);
  assert.match(text, /12 Oak St/);
});

test("name keys strip denominational boilerplate", () => {
  assert.equal(nameKey("St. Mary Coptic Orthodox Church"), "mary");
  assert.equal(nameKey("Our Lady of Lebanon Maronite Cathedral"), "lebanon");
  assert.equal(parishId("coptic-orthodox", "St. Mary Coptic Orthodox Church", "NJ", "Jersey City"),
    "coptic-orthodox-nj-mary-jersey-city");
});

test("deduplication matches on host, phone, and name+city but not across states", () => {
  const a = { name: "St. Mary Church", website: "https://www.stmaryjc.org/", address: { country: "US" as const, state: "NJ", city: "Jersey City" } };
  const b = { name: "Saint Mary Coptic Orthodox Church", website: "https://stmaryjc.org/contact", address: { country: "US" as const, state: "NJ", city: "Jersey City" } };
  assert.equal(sameParish(a, b), true);

  const c = { name: "St. Mary Church", address: { country: "US" as const, state: "TX", city: "Houston" } };
  assert.equal(sameParish(a, c), false);

  const byPhone = { name: "Totally Different Name", phone: "(201) 555-0123" };
  assert.equal(sameParish({ ...a, phone: "(201) 555-0123" }, byPhone), true);
});
