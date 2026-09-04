# leadsites

Find local businesses that have earned hundreds of Google reviews but never got a
website, confirm they really don't have one, then build them one in a click using
any of the 74 `DESIGN.md` design systems vendored here - written from what their
customers already said, with every claim on the page traceable to the evidence
behind it.

```
search Google Places  →  drop anyone under N reviews  →  prove the website gap
      →  find their socials  →  score & rank  →  pick one  →  pull their reviews
      →  plan the content from evidence  →  render the pages  →  review  →  publish
```

Zero build step. `@anthropic-ai/sdk` is the only dependency; the store is
`node:sqlite`, the server is `node:http`, and the frontend is plain ES modules.

## Quick start

```bash
git clone https://github.com/ruwaidbibi/leadsites.git
cd leadsites
npm install
cp .env.example .env      # optional - it runs on sample data without keys
npm start                 # http://localhost:4317
```

Requires Node 22.9+ (it uses `node:sqlite`). One dependency, no build step.

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

### Photos: read once, never republished

Google place photos - the customer-uploaded shots of the storefront, the room,
the food - are the richest signal about what a business actually looks like. They
also cannot go on the generated site, and that is not a judgment call:

- Google's terms exempt **only `place_id`** from the no-caching rule. Photo names
  and photo bytes may not be stored.
- Photos must be **fetched live and displayed with author attribution**.

A static HTML file published to a folder can do neither. So the site never shows
them. What it can do is *learn* from them: with `PHOTO_VISION=true`, the app
fetches a few photos, has the model report only what is visible, and throws the
images away. What persists is our own derived text:

```
scene    A single-story brick storefront with a striped pole beside the door and
         a hand-painted sign above the window.
signals  hand-painted sign · barber pole · brick facade · vintage chairs
palette  #8c3b2a on brick facade · #f2ead6 on painted signage
```

That description becomes evidence the planner can cite, so copy can say "the
brick shopfront on Edgewood" because the photos showed a brick shopfront. Photo
names and bytes are never written to disk or the database - the code has a
comment where they are deliberately dropped.

**One honest caveat.** Sending Google photos to a model for analysis is a use
those terms do not clearly address. That is why it is off by default. Read the
terms, or ask someone who reads them for a living, before turning it on. The
palette is also the model's estimate by eye, not a measurement of the pixels.

## Planning before building

Generation is two stages, and the split is the whole point.

**Stage one produces a content plan**, not HTML: which pages the site should
have, what each section says, and - for every section - which piece of evidence
entitles it to say that. The plan is small enough to read in thirty seconds:

```
Services  —  services.html
  What we do                                     high    [review: review 1] [review: review 3] [review: review 2]
  Our story                                      low     [category-norm]  ← nothing specific supports this
```

Each section is tagged `high`, `medium` or `low`, and anything resting only on
`category-norm` - a safe generality about this kind of business, supported by
nothing you were actually told - is flagged in the UI. You delete what is not
earned, then rebuild from the edited plan without re-planning.

The plan also reports two things worth reading:

- **ownerTodos** - what the owner has to supply before the site is honest.
- **claimsAvoided** - what a careless generator would have written here and this
  one did not, with the reason. "No 'family owned since 1974' - nothing states
  when the shop opened."

**Pages are chosen from the evidence, not a template.** A business with five
reviews naming distinct services earns a services page; one with no review text
does not. There is always an `index`, never more than five pages, and menu,
price-list, team and testimonials pages are forbidden outright because that
information does not exist in any of our sources.

## Generating

Pick one of the repo's `DESIGN.md` files and press Generate. The planner runs,
the plan appears in the UI, and then each page is rendered.

**How a multi-page site stays consistent.** The home page is generated as a
complete document and becomes the shell: its stylesheet, header and footer are
reused verbatim, and every other page is generated as just a `<main>` fragment
and assembled here. That guarantees five pages look like one site, keeps each
request small enough to be reliable, and makes the navigation deterministic
rather than something the model has to get right five times. If the home page
comes back in a shape that cannot be taken apart, the remaining pages fall back
to complete documents and the version is flagged for a styling check.

The `DESIGN.md` is sent as a cached prefix, so the plan call pays for it once and
each page render reads it from cache.

Both the planner and the renderer are built around one hard rule: **this is a real business
being described to real customers, so every factual claim must trace to a
supplied fact.** The model may state the address, phone, hours, rating, and
review count it was given. It is forbidden from inventing testimonials, staff
names, awards, certifications, "family owned since 1974", prices, guarantees, or
email addresses. Anything it doesn't know becomes a visibly outlined placeholder:

```html
<span class="leadsites-todo">[[ADD: two sentences on your story]]</span>
<div class="leadsites-photo">[[ADD PHOTO: storefront]]</div>
```

Output is self-contained by construction — no external CSS, JS, fonts, or images
— and the preview route serves it under a CSP that blocks any outbound request,
so a page that tries to phone home visibly breaks instead of quietly working.

The design system is borrowed as a *visual language only*: the prompt forbids
copying the source brand's name, logo, or copy, or implying any affiliation.

Not happy with it? Type what to change and regenerate. Each run is a new
version; the previous HTML and your notes go into the revision prompt, and every
version stays previewable and publishable.

## Generating without an API key

The generation half does not have to run inside this app. If you have no
`ANTHROPIC_API_KEY` configured here - or you would simply rather do it in a
Claude session where you can argue with the output - export the brief, generate
by hand, and import the result:

```bash
npm run brief -- <placeId> --design ferrari --out brief.md
#   ... produce plan.json + one .html per page from that brief ...
npm run import -- <placeId> --design ferrari --dir ./out --model claude-code
```

`npm run brief` with no arguments lists your saved leads and their ids.

The brief is one self-contained document containing both system prompts, the
plan schema, every piece of evidence, and the full `DESIGN.md`. Nothing else
about the business is needed, and nothing else about it is true.

The import is not a dumb file copy. It refuses a plan that is structurally
invalid, a page set that does not match the plan (either direction), a file that
is not an HTML document, and any page that references an external stylesheet,
script or image - because published pages must be self-contained. What lands is
a normal site version: the plan panel, the page tabs, preview, revision and
publish all work on it exactly as if this app had generated it. The `model`
column records what actually produced it, so the versions list stays honest.

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
| Place Details | once per business you choose | `reviews`, `editorialSummary`, `photos` | Enterprise + Atmosphere (~$40/1k) |
| Place Photo | once per photo, only with `PHOTO_VISION=true` | n/a | Place Photo, billed per photo |

Reviews are what push a call into the higher tier, which is exactly why they are
**not** in the search field mask. Putting them there would charge the premium on
all 60 results per query when you only ever build for one or two of them.

One search page is one billed request; `MAX_PAGES` defaults to 3, which is also
Google's ceiling (60 results per query). Results are cached in SQLite keyed by
place ID, and Place Details is skipped entirely if fresh reviews are already on
file, so the only thing that re-bills is a new search or an explicit re-fetch.

Photo analysis re-fetches Place Details every time rather than storing photo
names, because storing them is not allowed. That is one extra Details call per
analysis, by design.

Verify current rates before you budget - Google restructured Places pricing in
March 2025 and the per-SKU free allowances no longer pool across products.

### Model cost

One site is one plan call plus one call per page, so a three-page site is four
calls. The `DESIGN.md` (~8k tokens) is sent as a cached prefix on all of them, so
only the first pays full price for it. Watch `cache_read_tokens` on the version
row: if it stays at zero across pages, something is invalidating the prefix and
the site is costing several times what it should.

## Layout

```
design-md/               74 vendored DESIGN.md design systems (see NOTICE.md)
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
    designs.js           indexes design-md/
    schema.js            the content plan's shape, and what counts as weak
    planner.js           evidence -> content plan
    renderer.js          content plan -> pages, and the shell reuse
    vision.js            read photos once, keep only what was learned
    evidence.js          the evidence blocks and truth rules both stages share
    client.js            the shared Anthropic client and streaming
    generator.js         orchestrates plan -> render -> disk
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
- Sites are capped at five pages, with no contact form backend and no custom
  domain. A page needs evidence to exist, so a business with no review text will
  legitimately get two thin pages rather than five padded ones.
- Place Details returns at most 5 reviews, and Google chooses which. That is
  enough to learn what a business is known for; it is not a representative
  sample.

## Licensing

`design-md/` is vendored from
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md),
MIT licensed, Copyright (c) 2026 VoltAgent. Its licence and provenance are kept
in `design-md/LICENSE` and `design-md/NOTICE.md`. Keep both if you update it.

The design systems are used as a **visual language only**. The generation prompt
forbids copying any source brand's name, logo, wordmark, product names or
marketing copy onto a generated site, and forbids implying any affiliation with
it.

The application code itself has no licence yet - pick one and add a root
`LICENSE` before sharing this repository.

## Open decisions

Two things this POC deliberately does not settle:

**What the finished site should be built on.** Right now it is a single static
HTML file, which is the right answer for showing a prospect something within a
minute of finding them. It is not obviously the right answer for a site a
customer owns and edits for years. Deciding that means deciding who maintains it,
which is a business-model question, not a technical one.

The second open decision - whether to emit structured content alongside the HTML
- is now settled by the content plan. The plan *is* the portable content, stored
per version as `plan_json`, so moving a site to WordPress, Astro or anything else
later is a template that reads the plan, not a regeneration.

**Whether to show review pull-quotes with attribution.** Currently no review text
reaches the page at all. Attributed quotes are permitted by Google's policies if
you display the required attribution, and they are persuasive. That is a policy
call plus a prompt change, not an architecture change.
