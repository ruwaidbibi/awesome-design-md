# Qandela

**Eastern Christian parishes in the United States — who they are, where they are, and what is
happening this week.**

A directory of Maronite, Chaldean, Melkite, Greek Orthodox, Coptic Orthodox, Syriac Orthodox and
Assyrian Church of the East congregations, with the social accounts and upcoming events found on
their own websites.

### The name

Classical Syriac ܩܢܕܝܠܐ *qandēlā*, the hanging oil lamp that burns before the sanctuary — present
in all seven of these traditions. The word itself travelled the same route the project covers:
Greek *kándēla* → Syriac *qandēlā* → Arabic *qandīl*, the three liturgical language families of the
churches in scope. A lamp is also the obvious thing to name a directory after: it is what you carry
to find your way to somewhere.

Two pieces:

- **`pipeline/`** — a TypeScript crawler that reads each jurisdiction's official parish directory,
  visits parish websites for social accounts and calendar feeds, geocodes addresses, and collects
  events.
- **`web/`** — a Next.js app: filterable directory with a map, per-parish pages, and a national
  events feed.

---

## Quick start

```bash
cd qandela
npm install
cp .env.example .env          # optional; see Configuration below

npm run dev                   # runs against the synthetic demo dataset
```

On a fresh clone the web app runs on `data/fixtures/sample-dataset.json`, which is **entirely
invented** — placeholder names, 555 numbers, example.org URLs — and the app shows an orange banner
saying so. To replace it with real data:

```bash
npm run pipeline -- targets   # what will be crawled
npm run refresh               # harvest -> enrich -> geocode -> events -> build
npm run pipeline -- report    # per-tradition coverage and everything flagged
```

`refresh` writes `web/data/dataset.json`, which the app prefers over the fixture. Expect the first
run to take a while: it is a polite crawler (1.5s per host between requests, robots.txt honoured).

---

## Scope

Seven traditions, sixteen US jurisdictions, defined in [`data/jurisdictions.json`](data/jurisdictions.json):

| Tradition | Family | US jurisdictions | Reported US parishes |
|---|---|---|---|
| Maronite Catholic | Eastern Catholic | Brooklyn, Los Angeles | ~69 |
| Chaldean Catholic | Eastern Catholic | Detroit, San Diego | ~27 |
| Melkite Greek Catholic | Eastern Catholic | Newton | ~50 |
| Greek Orthodox | Eastern Orthodox | GOARCH + 8 metropolises | ~525 |
| Coptic Orthodox | Oriental Orthodox | Southern US, NY/New England, Los Angeles, Archdiocese of NA | ~250 |
| Syriac Orthodox | Oriental Orthodox | Eastern US, Western US | ~60 |
| Assyrian Church of the East | Church of the East | California, Eastern USA, Western USA | ~35 |

The Malankara Archdiocese of North America is in the registry but `enabled: false` — canonically
Syriac Orthodox, but a distinct Indian tradition, so it is opt-in rather than a silent addition.

### Registry confidence

Every directory URL carries a `confidence`:

- **`verified`** — the URL was observed directly in a source.
- **`reported`** — a source described the site but the exact directory path was not observed.
- **`pattern`** — inferred from a convention its confirmed siblings use (the GOARCH metropolis
  subdomains, mostly).

The first `harvest` run checks all of them and writes results to `data/registry-health.json`, which
`report` renders. Expect to fix a handful of paths after that first run; that is the intended
workflow, not a failure.

---

## How extraction works

There are no per-site CSS selectors in this repo, deliberately. Twenty-odd jurisdictions run
twenty-odd content management systems, and hand-tuned selectors break on the first redesign. The
pipeline uses a ladder instead, and records which rung produced each field:

| Rung | Method | Confidence | Covers |
|---|---|---|---|
| 1 | JSON-LD `Church` / `Place` / `Organization` | 0.95 | Sites with structured data |
| 2 | Repeated blocks containing a `CITY, ST ZIP` address | 0.6 | Most table and card directories |
| 3 | Model reads the page text (`--llm`) | 0.5 | Everything else |

Rung 2 is the interesting one: anchoring on a parseable US address is a strong enough signal that a
block is a parish entry, and it works regardless of class names. Rung 3 needs `ANTHROPIC_API_KEY`
and is prompted hard against invention — an omitted field is correct, an invented one is a defect.

Every parish page shows its own provenance chain, so a record read by the model is visibly
different from one read out of JSON-LD.

---

## Events, and honest coverage

`npm run events -- --sources=...` takes any of:

| Source | What it reads | Notes |
|---|---|---|
| `ical` | `.ics` feeds found during `enrich` | Best source. Real times, timezones, recurrence, cancellations. |
| `jsonld` | `schema.org/Event` markup | Good. Common on Squarespace and WordPress event plugins. |
| `rss` | News/announcement feeds | Weak. Only items whose title reads like an event are kept. |
| `html` | Model reads calendar and bulletin pages | Lifts coverage materially. Costs a model call per page per refresh. |
| `meta` | Meta Graph API | Only for Pages that granted your app a token. See below. |
| `submissions` | `data/submissions.json` | Highest confidence: a human at the parish typed it. |

Default is `ical,jsonld,rss,submissions`.

**Realistic expectation:** structured feeds alone reach roughly a quarter to a half of parishes,
because that is how many publish machine-readable calendars. Adding `html` helps a lot. A
meaningful number of parishes — especially smaller Chaldean, Syriac and Assyrian communities —
publish events only to Facebook, or only in a weekly PDF bulletin. For those, `meta` and
`submissions` are the only paths, and both require someone at the parish to act.

### Facebook and Instagram

`sources=meta` uses the **Meta Graph API** with a Page access token that the Page's own admin has
granted to your app:

1. Create a Meta app and take it through App Review for `pages_read_engagement`.
2. Each parish signs in and grants your app access to their Page.
3. Store the long-lived Page tokens in the file named by `META_PAGE_TOKENS_FILE`, keyed by parish id:
   ```json
   { "coptic-orthodox-nj-mary-jersey-city": { "pageId": "123...", "accessToken": "EAA..." } }
   ```

Parishes that have not granted a token are skipped. There is no scraping fallback, on purpose:
reading Facebook without that grant breaks Meta's terms, and a directory built on scraped markup
breaks the first time they change it. `/submit` includes copy aimed at parish staff explaining the
opt-in.

Meta deprecated the public Events edge for most apps years ago. The Graph version is pinned in
`pipeline/src/sources/meta-graph.ts` so an upstream change fails loudly rather than silently
returning nothing — check Meta's changelog before a production run.

---

## Commands

```
npm run pipeline -- targets    List what the registry will crawl
npm run pipeline -- harvest    Read parish directories        [--tradition --jurisdiction --llm --fresh --dry-run]
npm run pipeline -- enrich     Parish sites: socials, feeds   [--missing-only --llm --limit]
npm run pipeline -- geocode    US Census, Nominatim fallback  [--limit]
npm run pipeline -- osm        Cross-check OpenStreetMap      [--tradition --dry-run]
npm run pipeline -- events     Collect events                 [--sources --horizon --limit]
npm run pipeline -- build      Emit web/data/dataset.json     [--include-unplaced]
npm run pipeline -- refresh    All of the above, in order
npm run pipeline -- report     Coverage and flags

npm run -w @qandela/pipeline test    Extractor tests
npm run typecheck                     Both workspaces
```

`osm` is a cross-check, not a primary source. OSM's `denomination` tag is inconsistently applied,
so it under-reports badly and is never used alone to establish that a parish exists. What it does
contribute: coordinates for parishes whose address failed to geocode, and parishes that exist on
the ground but never made it onto their eparchy's website (flagged `osm-only` and
`needs-jurisdiction` for a human to attribute).

---

## Configuration

See [`.env.example`](.env.example). Nothing is required to run the structured-only pipeline.

| Variable | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | `--llm` extraction (rung 3, and the `html` event source) |
| `GEOCODER_CONTACT` | The Nominatim fallback. Its usage policy requires a real contact address. |
| `META_APP_ID` / `META_APP_SECRET` / `META_PAGE_TOKENS_FILE` | `sources=meta` |
| `CRAWL_DELAY_MS` | Per-host politeness delay, default 1500ms |
| `NEXT_PUBLIC_MAP_STYLE` | Your own MapLibre style URL |

**Basemap:** the map defaults to OpenStreetMap's raster tiles, which are free but rate limited and
not intended for production traffic. Point `NEXT_PUBLIC_MAP_STYLE` at your own vector style
(MapTiler, Protomaps, a self-hosted tileserver) before putting this in front of real users. Markers
render regardless of whether tiles load.

---

## Data model

`pipeline/src/schema.ts` is the contract; everything written and read is validated against it. Two
choices worth knowing about:

**Provenance is per-field-group, not per-record.** Each parish carries a chain of
`{source, url, method, fetchedAt, confidence}`, and merges keep the higher-confidence value. This
is what lets the UI say "read by a model from this page on this date" instead of presenting
everything as equally solid.

**Deduplication runs on the cheapest reliable signal first** — website host, then phone, then
name+city, then a 200m coordinate proximity check within the same tradition. Name similarity alone
is unusable when a tradition has fourteen parishes called "St. Mary". Parish ids are built from
tradition + state + a name stripped of denominational boilerplate, so they survive a site redesign.

`build` holds back parishes with neither a state nor coordinates — a record that cannot be mapped
or filtered inflates the counts and makes the directory look wrong. `--include-unplaced` ships them
anyway.

---

## Crawler conduct

These are small sites run by volunteers. The fetcher honours `robots.txt`, waits 1.5s between
requests to the same host, caches responses for a week, backs off on 429 and 5xx, and identifies
itself with a contactable User-Agent. Change `CRAWL_USER_AGENT` to something that points at you
before running it at scale.

---

## Known gaps

- The Coptic Archdiocese of North America has no confirmed standalone directory; the patriarchate's
  diocese index is used as the entry point and will need replacing after the first run.
- The Assyrian Eastern and Western USA dioceses have no standalone parish directory that could be
  confirmed; the denomination's news site filtered by diocese is a weak entry point and will yield
  little. The California diocese does have a real directory.
- GOARCH metropolis subdomains beyond Detroit and Pittsburgh are pattern-inferred.
- `data/parishes.json` ships empty. Real parish records only ever come from running the pipeline.
