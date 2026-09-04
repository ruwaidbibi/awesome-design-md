# sitesmith

Find local businesses that have earned hundreds of Google reviews but never got a
website, confirm they really don't have one, then build them one in a click using
any of the 74 `DESIGN.md` files in this repo.

```
search Google Places  →  drop anyone under N reviews  →  prove the website gap
      →  find their socials  →  score & rank  →  pick one  →  pull their reviews
      →  generate  →  review  →  publish
```

Zero build step. `@anthropic-ai/sdk` is the only dependency; the store is
`node:sqlite`, the server is `node:http`, and the frontend is plain ES modules.

## Quick start

```bash
cd apps/sitesmith
npm install
cp .env.example .env      # optional - it runs on sample data without keys
npm start                 # http://localhost:4317
```

Requires Node 22.9+.

| Key | Needed for | Without it |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | real prospecting | falls back to 14 sample businesses so the rest of the app is still usable |
| `ANTHROPIC_API_KEY` | generating sites | the Generate button is disabled; everything else works |
| `BRAVE_SEARCH_KEY` or `SERPAPI_KEY` | finding socials Google doesn't list | socials are only found when Google's own website field points at one |

`npm run check` runs the offline test suite (22 assertions, no keys, no network).

## Geography

The POC covers the Jacksonville metro and nothing else. That is enforced twice:

- the **city name goes into the text query**, because Google geocodes
  "barber shops in Orange Park, FL" better than any box we could draw;
- a **metro bounding box goes into `locationRestriction`**, which is a hard
  filter, so a stray match in Tampa or Savannah cannot come back at all.

Fourteen cities across five counties are in scope: Jacksonville and the beaches
(Duval), Orange Park, Fleming Island, Middleburg, Green Cove Springs (Clay),
Ponte Vedra Beach and St. Augustine (St. Johns), Fernandina Beach, Yulee,
Callahan (Nassau), and Macclenny (Baker). Asking for a city outside that list is
rejected rather than silently searched.

The box (29.75/-82.25 to 30.78/-81.20) is coarse on purpose. It is a fence, not a
targeting mechanism; the city name does the aiming.

## Deciding that a business has no website

This is the part worth getting right, because "Google shows no website" and "this
business has no web presence" are not the same claim. Every lead carries the
verdict, the evidence, and the timestamp.

| Verdict | What it means | Counted as a lead |
|---|---|---|
| `none` | The Places `websiteUri` field is empty | yes |
| `social_only` | The website field points at Facebook, Instagram, TikTok, Linktree, … | yes |
| `directory_only` | It points at Yelp, DoorDash, Booksy, `order.online`, … — someone else's page | yes |
| `dead` | The domain does not resolve, refuses connections, or returns 404/410 | yes |
| `parked` | The domain resolves but serves a placeholder (for-sale page, "coming soon", a title that is just the domain, a page with almost no text) | yes |
| `unreachable` | Timed out, TLS failure, 5xx, or a bot filter (401/403/406/429) | **no** — needs a human |
| `live` | A real page loaded | no |

Two details that stop false positives:

- A URL is judged by **where it lands**, not where it starts. A vanity domain
  that 301s to a Facebook page is `social_only`.
- A 403 is a bot filter far more often than a missing site, so it is
  `unreachable` (go look yourself), never `dead`. Bounce-based tools get this
  wrong and hand you leads that already have a website.

Known hosts are classified without a request; only an unrecognised host is
actually fetched.

## Socials

Every profile records where it came from and how much to trust it, and nothing is
asserted without evidence:

| Source | Confidence | Notes |
|---|---|---|
| `google-places` | high | Google's own website field pointed at a profile |
| `web-search` | medium / low | Brave or SerpApi result; medium only when the business name actually appears |
| `handle-guess` | low | Probes `instagram.com/<slug>` and `facebook.com/<slug>`. Off by default (`SOCIAL_GUESS=true`) because both platforms soft-404 and rate limit |

With no search key configured the UI says so on the lead rather than implying
the business has no social presence.

## Scoring

A transparent sum, shown as a bar chart per lead so you can argue with it:

| Term | Max | Basis |
|---|---|---|
| Review volume | 40 | `log10(reviews)/3`, capped — 1000 reviews maxes it |
| Rating | 15 | linear from 3.5★ to 5.0★ |
| Website gap | 25 | `none` 25 · `dead`/`parked` 22 · `directory_only` 18 · `social_only` 15 · `live` 0 |
| Reachable by phone | 8 | a listed phone number |
| Existing social presence | 7 | already marketing somewhere, easier conversation |
| Not operational | −40 | penalty for `CLOSED_PERMANENTLY` / `CLOSED_TEMPORARILY` |

## Working out what the site should say

Facts alone produce a generic page. What makes a generated site sound like *this*
barber shop is the reviews: they name the services people actually come for
("beard trim", "hot towel shave", "walk-ins", "kids cuts") and the qualities
worth leading on.

Reviews come from a **Place Details** call, made on demand for the one business
you chose, never for a whole search. That is a billing decision as much as a
design one: see [API costs](#api-costs).

Three rules govern how they are used, enforced in the generation prompt:

1. **Never reproduced.** Reviews are research input. The model is instructed not
   to quote or closely paraphrase them, and no review text reaches the page.
2. **Never attributed.** No reviewer is named, quoted, or alluded to.
3. **Never defensive.** Complaints are not repeated or answered.

The reasoning: republishing Google review text on a third party's site is a
licensing question you do not want to answer per-site, and invented-sounding
testimonials are exactly what makes a generated site read as fake. Stating the
aggregate ("4.9 stars across 287 Google reviews") is both safe and the strongest
proof point available. If you later decide you *do* want pull quotes with proper
attribution, it is a prompt change plus a policy review, not an architecture
change.

Review data is stored with a fetch timestamp and **ignored once it is more than
30 days old**, which is the limit Google's terms allow place content to be
cached for. Stale rows stay visible in the UI, marked as not in use, until you
re-fetch.

### What socials contribute, and what they don't

Socials give you two things: a signal that the business markets itself somewhere
(worth 7 points in the score) and links to put on the finished site. They do not
give you content. There is no supported way to read posts from Facebook or
Instagram without the business's own permission, and scraping them is both
against those platforms' terms and unreliable.

So the honest path for social-derived content is manual: look at their page, and
put what you learn in the **operator notes** box on the lead. Those notes go into
the generation prompt as verified fact, on the same footing as the address and
phone number.

## Generating

Pick one of the repo's `DESIGN.md` files, press Generate, and the model streams a
single self-contained HTML document styled by that design system. Progress
(reasoning summary, then kilobytes of HTML) streams into the UI over SSE.

The generation prompt is built around one hard rule: **this is a real business
being described to real customers, so every factual claim must trace to a
supplied fact.** The model may state the address, phone, hours, rating, and
review count it was given. It is forbidden from inventing testimonials, staff
names, awards, certifications, "family owned since 1974", prices, guarantees, or
email addresses. Anything it doesn't know becomes a visibly outlined placeholder:

```html
<span class="sitesmith-todo">[[ADD: two sentences on your story]]</span>
<div class="sitesmith-photo">[[ADD PHOTO: storefront]]</div>
```

Output is self-contained by construction — no external CSS, JS, fonts, or images
— and the preview route serves it under a CSP that blocks any outbound request,
so a page that tries to phone home visibly breaks instead of quietly working.

The design system is borrowed as a *visual language only*: the prompt forbids
copying the source brand's name, logo, or copy, or implying any affiliation.

Not happy with it? Type what to change and regenerate. Each run is a new
version; the previous HTML and your notes go into the revision prompt, and every
version stays previewable and publishable.

## Publishing

`POST /api/sites/:id/publish` writes the file to `data/published/<slug>/index.html`
and serves it at `/published/<slug>/`, alongside a `published.json` recording
which version went live and when.

That is deliberately a local target. Adding a hosted one is a single entry in
`targets` in `src/publish.js` with the same three members — `available()`,
`describe()`, `publish({business, site, html})` returning a URL. `src/publish.js`
carries a sketch of the Netlify deploy call; nothing else in the app changes.

## API costs

Places bills by the most expensive field you ask for, so the app deliberately
splits its requests across two tiers:

| Call | When | Fields that set the tier | SKU |
|---|---|---|---|
| Text Search | once per page of a search | `websiteUri`, `userRatingCount`, `rating` | Enterprise (~$35/1k) |
| Place Details | once per business you choose | `reviews`, `editorialSummary` | Enterprise + Atmosphere (~$40/1k) |

Reviews are what push a call into the higher tier, which is exactly why they are
**not** in the search field mask. Putting them there would charge the premium on
all 60 results per query when you only ever build for one or two of them.

One search page is one billed request; `MAX_PAGES` defaults to 3, which is also
Google's ceiling (60 results per query). Results are cached in SQLite keyed by
place ID, and Place Details is skipped entirely if fresh reviews are already on
file, so the only thing that re-bills is a new search or an explicit re-fetch.

Verify current rates before you budget - Google restructured Places pricing in
March 2025 and the per-SKU free allowances no longer pool across products.

## Layout

```
src/
  config.js              env + paths
  geo.js                 the Jacksonville fence, city list, category presets
  db.js                  node:sqlite schema and queries
  http.js                router, SSE, static serving, JSON helpers
  server.js              routes
  selftest.js            npm run check
  providers/
    places.js            Google Places API (New) searchText
    fixtures.js          sample data, no key required
  pipeline/
    classify.js          pure classification + scoring (host lists, parked-page rules)
    content.js           Place Details fetch, and what the generator may use
    freshness.js         the 30-day review caching rule
    validate.js          HTTP probing and social discovery
    prospect.js          search → filter → validate → score → persist
  generate/
    designs.js           indexes ../../design-md
    generator.js         the prompt, the stream, the HTML extraction
  publish.js             publish targets
public/                  the UI (index.html, app.js, styles.css)
data/                    gitignored: SQLite db, generated sites, published sites
```

## Limits worth knowing

- Google Places has no "businesses without a website" filter, so the app fetches
  candidates and filters client-side. Broad queries burn requests fast; keep them
  specific ("barber shops in East Austin" beats "barber shops in Texas").
- 60 results per query is a hard API ceiling. Cover a city by running several
  narrower searches, not one wide one.
- Website probing needs unrestricted outbound HTTP. Behind a filtering proxy
  everything lands in `unreachable`, which is the honest answer but not a useful
  one.
- Generated sites are one page. Multi-page output, a real contact form backend,
  and custom domains are all out of scope here.
- Place Details returns at most 5 reviews, and Google chooses which. That is
  enough to learn what a business is known for; it is not a representative
  sample.

## Open decisions

Two things this POC deliberately does not settle:

**What the finished site should be built on.** Right now it is a single static
HTML file, which is the right answer for showing a prospect something within a
minute of finding them. It is not obviously the right answer for a site a
customer owns and edits for years. Deciding that means deciding who maintains it,
which is a business-model question, not a technical one.

**Whether the model should emit structured content alongside the HTML.** If it
did, moving a site to WordPress, Astro, or anything else later would be a
template swap rather than a regeneration. The cost is a slightly more constrained
prompt; the benefit is that the platform decision above stops being a rewrite.
