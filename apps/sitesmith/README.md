# sitesmith

Find local businesses that have earned hundreds of Google reviews but never got a
website, confirm they really don't have one, then build them one in a click using
any of the 74 `DESIGN.md` files in this repo.

```
search Google Places  →  drop anyone under N reviews  →  prove the website gap
      →  find their socials  →  score & rank  →  pick one  →  generate  →  review  →  publish
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

Text Search with a field mask containing `websiteUri` and `userRatingCount` bills
at the Places **Enterprise** SKU, and those two fields are the entire point of the
app, so there is nothing to trim. One page is one billed request; `MAX_PAGES`
defaults to 3, which is also Google's ceiling (60 results per query). Results are
cached in SQLite and keyed by place ID, so re-running a search re-bills the
search but never re-bills places you already hold.

## Layout

```
src/
  config.js              env + paths
  db.js                  node:sqlite schema and queries
  http.js                router, SSE, static serving, JSON helpers
  server.js              routes
  selftest.js            npm run check
  providers/
    places.js            Google Places API (New) searchText
    fixtures.js          sample data, no key required
  pipeline/
    classify.js          pure classification + scoring (host lists, parked-page rules)
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
