# leadsites

Find local businesses that have earned hundreds of Google reviews but never got a
website, confirm they really don't have one, then build them one in a click using
any of the 74 `DESIGN.md` files in this repo - written from what their customers
already said, with every claim on the page traceable to the evidence behind it.

```
search Google Places  →  drop anyone under N reviews  →  prove the website gap
      →  find their socials  →  score & rank  →  pick one  →  pull their reviews
      →  research the market  →  write the brief  →  plan the content
      →  render the pages  →  apply SEO  →  run the QA gates  →  review  →  publish
```

Zero build step. `@anthropic-ai/sdk` is the only dependency; the store is
`node:sqlite`, the server is `node:http`, and the frontend is plain ES modules.

## Quick start

```bash
cd apps/leadsites
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
| `PUBLIC_BASE_URL` | canonical tags, Open Graph URLs and `sitemap.xml` | those are omitted, because a canonical pointing at a URL that does not serve the page is worse than none |

```bash
npm run check    # the offline test suite: 123 assertions, no keys, no network
npm run qa       # re-run the QA gates across every stored site
```

## One business, start to finish

Building a site for a business you already have in mind is a different job from
prospecting, and it should not mean running a search sweep and clicking through
sixty results. One command:

```bash
npm run site -- "Blessed Hands Barber Parlor, Chicago"
npm run site -- "https://www.google.com/maps/place/K+Cuts+Barbershop/@30.3,-81.6,17z"
npm run site -- fx-002 --design ferrari
```

It looks the business up unfenced (you already know who you want), validates the
website gap, pulls the reviews, runs stage 1, and then either runs stages 2-6 or
writes the handoff if there is no `ANTHROPIC_API_KEY`. Several name matches stops
and lists them rather than guessing; `--pick N` chooses.

A Google Maps URL works because the business name is in its `/place/` segment.
A **`share.google/...` short link does not** — it carries nothing until a browser
opens it, and the API cannot follow it. The tool says so and tells you to paste
what the link lands on instead. (The `!1s0x88e5...` identifier inside a maps URL
is an *ftid*, not a Places place id, so it is deliberately ignored rather than
sent to an API that would reject it.)

### Adding one business by name, from the UI

The metro fence below applies to prospecting sweeps. `POST /api/lookup` with
`{"query": "..."}` searches unfenced and adds the matches. Those rows carry no
city, which keeps them out of the metro hit-rate statistics they would otherwise
distort. It validates and scores them like any other lead; it does not generate
anything.

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

## Where to look

- `examples/` — three real businesses taken through the pipeline, with their
  plans, pages and the reasoning behind what each site refused to claim. Start
  with `examples/README.md`.
- `docs/pipeline-plan.md` — the design record for taking this from two stages to
  an agency-grade six. Not built; a plan to argue with.

## Nothing is generated unless you ask for it

Prospecting and generating are deliberately separate, and no code path crosses
from one to the other. A search can return sixty businesses; it will never write
a word for any of them.

Exactly three entry points produce a site, and each takes one business:

| Entry point | Scope |
|---|---|
| `generateSite` | one business, one explicit request |
| `rebuildSite` | one existing version, re-rendered from its stored plan and brief |
| `importSite` | one business, from a brief, plan and pages generated elsewhere |

`runProspect` - the only thing that handles businesses in bulk - searches,
validates, scores and returns. It does not import the generator.

Stage 1 is the one exception, and only because it is free: `runResearch` and the
`/research` endpoint can be run on a business without committing to anything,
which is the point — seeing the competitive set before spending on a brief.
They make no model call and write no page.

Keep it that way. Generating for a business you have not chosen costs money per
site, and puts a page carrying a real company's name into the world without
anyone deciding it should exist.

## Six stages, one click

The commodity AI site builders go from "here is a business" straight to "here is
a page". That is why their output is interchangeable: nothing ever decided what
the site is *for*, who it is *against*, or what it should *feel* like. They
automate an agency's deliverables without automating its decisions, and they
start from a single business in isolation.

| | Stage | Cost |
|---|---|---|
| 1 | **Research** — the competitive set, brand signals, local search | no model call |
| 2 | **Creative brief** — strategy and art direction, design system chosen | 1 call |
| 3 | **Content plan** — what each section says, and on what evidence | 1 call |
| 4 | **Render** — the HTML | 1 call per page |
| 5 | **SEO** — titles, descriptions, JSON-LD, sitemap | no model call |
| 6 | **QA** — the gates that decide whether it may publish | no model call |

Four of the six cost milliseconds, which answers the obvious objection: adding
research, strategy and QA to a one-click flow does not make it slow, because
most of it is arithmetic over data already on file.

`docs/pipeline-plan.md` is the reasoning behind the shape, including the two
things in it that were deliberately not built.

## 1 · Researching the market

Three things, all deterministic, all free.

**The competitive set** comes out of the businesses already scanned: where this
one ranks by review count, what the median rival looks like, and how many of
them have a live site. "317 reviews at 5.0 puts this shop in the top 17% of
seven barbershops within 8 km" is a fact a homepage may state, and it is only
sayable because the set was scanned. Below four peers it returns
`basis: "insufficient"` rather than a percentile nobody should trust, and
nothing downstream may then claim a ranking at all.

Optionally it reads up to three rival homepages. That produces two different and
equally useful answers:

- **Table stakes** — what a majority of them have (booking, prices, a gallery).
  Absent, our site looks amateur.
- **Crowded hues and fonts** — what a majority of them *look like*. If four of
  five local shops use gold on near-black with a script face, using it too makes
  this business invisible in the one place it is compared: a phone screen with
  three tabs open. This is the single best argument for doing competitor
  research at all, and it feeds art direction directly.

**Brand signals** are assembled, not invented: what the trading name already
carries (*Blessed Hands Barber **Parlor*** is craft, faith and old-school
refinement before anyone writes a word), the trade's conventions, and the words
customers actually use. That last one is extracted as **single words with
counts, never phrases**, and nothing said by only one reviewer survives. A word
frequency is a derived statistic; a phrase is a fragment of someone's review,
and the whole point of the no-verbatim rule is that those do not travel.

**Local search** is almost entirely arithmetic: the right schema.org type, the
parsed address, the query patterns customers actually type, and the NAP block
that has to match the Google listing character for character. There are no
search volumes, because this tool has no keyword data and will not pretend to.
It also emits a Google Business Profile list — for a shop with three hundred
reviews and no website, that list is plausibly worth more than the website.

## 2 · The creative brief

One model call. Strategy and art direction come back in one object because they
are one decision made by one person in one sitting; splitting them is how copy
and design end up arguing.

- **conversionGoal** — one action: call, book, visit, quote or order. Not
  "contact us". Someone whose car will not start is not going to fill in a form.
  `book` and `order` are only available if the evidence contains a real place to
  do it, because inventing a booking flow is inventing a fact.
- **positioning** — the claim, its named proof, and its **parity items**: things
  true of this business and equally true of every rival. "Experienced barbers",
  "quality service", "friendly staff" — all true, all worthless in a hero,
  because the shop next door says them too. Naming them is how the hero stops
  being generic.
- **mustNotSay** — anything unsupported, anything the reviews genuinely disagree
  about, anything every rival claims. This is enforced, not advisory: a page
  containing one of these phrases cannot be published.

**The design system is chosen, not picked from a dropdown.** Selecting one of
seventy-odd systems by vibe is input we should not be asking for, and it is
exactly how four local barbershops end up with the same site. The brief chooses
and has to justify it against the rivals it was shown — "dark editorial with a
single hot accent: four of five local rivals use cream and script". The dropdown
remains as an override, and the brief still has to say whether it agrees.

No generated logo. For a business at this budget an AI mark is worse than their
own name well set, so the brief specifies a *wordmark treatment* from the type
system it chose. And there are no real photographs available to a published page
(see *Photos: read once, never republished*), so `imageStrategy` decides what
carries the frame instead.

## 3 · Planning before building

**Stage three produces a content plan**, not HTML: which pages the site should
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

**Pages come from the brief's navigation, and the brief derived them from the
conversion goal.** Every page has to answer "what does this do for the goal";
if it cannot, it is not in the brief. There is always an `index`, never more
than five pages, and menu, price-list, team and testimonials pages are
forbidden outright because that information does not exist in any of our
sources.

Where the plan departs from the brief, that is reported as **drift** rather than
failed. A planner that drops a page because the evidence genuinely cannot fill
it is behaving correctly — but it has to be visible that it did, or the brief is
decoration.

## 4 · Generating

Press Generate. Research runs instantly, the brief and the plan appear in the
UI as they finish, and then each page is rendered.

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

## 5 · SEO, applied in code

No model call, on purpose. Titles have a pixel budget, meta descriptions have a
character budget, JSON-LD has a schema, and a model asked for "an SEO title"
reliably writes seventy-eight characters of adjectives. The facts are already in
the database.

What it writes: a length-clamped `<title>` and description per page, a
`LocalBusiness` JSON-LD node on the home page *only* (repeating the same entity
on every page is a structured-data error, and a common generator mistake),
Open Graph tags, and — once a real deployment URL exists — the canonical tag,
`sitemap.xml` and `robots.txt`.

`aggregateRating` is emitted only when Google gave us both the value and the
count, since a rating without a count is rejected. If `PUBLIC_BASE_URL` is not
set, the canonical and sitemap are simply omitted: a canonical tag pointing at a
URL that does not serve the page is worse than none.

The whole block is fenced in a comment and replaced wholesale, so re-applying it
— which happens on every rebuild and again at publish — leaves nothing
duplicated.

## 6 · The QA gates

Twelve checks, no model call, run before the files are even written. Six block
publishing and six are advisory, and that split is the design: blocking means
the site is *wrong*, advisory means it is *worse than it should be*. A score
that mixes "this page names a reviewer" with "this meta description is four
characters long" is a number nobody can act on.

**Blocking.** Review wording, measured as the longest run of words shared with
the source reviews (five is the threshold — shorter runs happen by chance
between any two texts about the same subject). Reviewer names. Claims present
in neither the plan nor the evidence, which is to say claims that appeared
*during rendering*: founding years, credentials, guarantees, prices, email
addresses, award claims, staff counts, second locations. A phone number that is
not theirs. External resources. Anything from the brief's `mustNotSay`.

**Advisory.** The conversion action on every page and above the fold. Planned
placeholders surviving as placeholders rather than being quietly filled with
plausible-sounding copy. Accessibility: landmarks, heading order, labelled
controls, focus styles. The technical head budget. JSON-LD presence and
validity. And whether the design system's tokens were actually used or merely
approximated.

"The generator never quotes a review" and "the generator never invents a
credential" used to be prompt instructions that I asserted held. They are now
measured per build. Publishing past a hard failure is possible and requires
saying so explicitly; what was overridden is recorded.

```bash
npm run qa              # every stored site, as a table
npm run qa -- --site 7  # one version
```

Deterministic, so it costs nothing, runs in CI, and is how a prompt change gets
judged against the whole corpus instead of one lucky output.

## Generating without an API key

The three model-call stages do not have to run inside this app. If you have no
`ANTHROPIC_API_KEY` configured here - or you would simply rather do it in a
Claude session where you can argue with the output - export the handoff
document, generate by hand, and import the result:

```bash
npm run handoff -- <placeId> --out handoff.md
#   ... produce brief.json + plan.json + one .html per page from it ...
npm run import -- <placeId> --dir ./out --model claude-code
```

`npm run handoff` with no arguments lists your saved leads and their ids. Pass
`--design <key>` to override the design choice; leave it off and the document
carries the whole catalogue and the brief stage chooses, exactly as the app
does.

The handoff is one self-contained document: the research already computed, all
three system prompts verbatim, the brief and plan schemas, every piece of
evidence, and the `DESIGN.md` once a system is chosen. There is one source for
those prompts and this document quotes it, so the two paths cannot drift.

The import is not a dumb file copy. It refuses a plan that is structurally
invalid, a brief that is, a page set that does not match the plan (either
direction), a file that is not an HTML document, and any page that references an
external stylesheet, script or image. Then it runs stages 5 and 6 — so
hand-generation is not a way around the SEO treatment or the QA gates, and the
CLI exits non-zero if a hard gate fails. What lands is a normal site version:
every panel, preview, revision and publish work on it exactly as if this app had
generated it, and the `model` column records what actually produced it.

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

One site is one brief call, one plan call and one call per page, so a three-page
site is five calls. Research, SEO and QA are free — they are code.

Two different cached prefixes are at work. The brief call sends the design
catalogue (~20k tokens), which is identical for every business, so the second
brief of a session pays for it once. The plan and render calls send the chosen
`DESIGN.md` (~8k tokens) as their prefix. Watch `cache_read_tokens` on the
version row: if it stays at zero across pages, something is invalidating the
prefix and the site is costing several times what it should.

Adding research and the brief cost one extra call and a few hundred milliseconds
against a flow that already spends four or five calls, which is the whole reason
the expensive stages are the ones a human would also have had to think about.

## Layout

```
src/
  config.js              env + paths
  geo.js                 the Jacksonville fence, city list, category presets
  db.js                  node:sqlite schema and queries
  http.js                router, SSE, static serving, JSON helpers
  server.js              routes
  selftest.js            npm run check
  maps-link.js           what a pasted Google link can and cannot tell us
  cli/
    site.js              npm run site - one business, start to finish
    handoff.js           npm run handoff - the document for generating by hand
    import.js            npm run import - bring a hand-generated site back in
    qa.js                npm run qa - re-run the gates across stored sites
  research/              stage 1, all deterministic
    competitors.js       the scanned set, and reading rival homepages
    brand.js             name signals, trade conventions, customer vocabulary
    localseo.js          schema type, query patterns, NAP, GBP advice
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
    schema.js            the brief's and the plan's shapes, and drift between them
    creative-brief.js    stage 2: research -> strategy and art direction
    planner.js           stage 3: brief + evidence -> content plan
    renderer.js          stage 4: plan -> pages, and the shell reuse
    seo.js               stage 5: titles, descriptions, JSON-LD, sitemap
    qa.js                stage 6: twelve gates, six of them blocking
    vision.js            read photos once, keep only what was learned
    evidence.js          the evidence blocks and truth rules every stage shares
    client.js            the shared Anthropic client and streaming
    generator.js         orchestrates all six stages -> disk
    handoff.js           the same prompts, as one document, for manual runs
    importer.js          bring a hand-generated site in through 5 and 6
  publish.js             publish targets, gated on QA
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
- The competitive set is only as good as what has been scanned. Four peers is
  the floor below which it reports `insufficient` rather than a percentile, and
  "nearby" is a straight-line radius, not drive time or a trade area.
- Rival homepages are read with a plain GET. Anything behind Cloudflare, a
  consent wall or a JavaScript-rendered shell comes back unreadable, and the
  research says so rather than guessing. The crowded-palette read is also
  frequency over hex codes in the CSS, which is a decent proxy for "what this
  site looks like" and not the same thing as looking at it.
- The QA gates are static analysis. They can prove a sentence was not copied
  from a review and that a credential has no source; they cannot tell you the
  copy is any good, and nothing in them measures whether the page is beautiful.

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
