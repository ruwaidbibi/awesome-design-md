# Raising the site builder to agency quality

## Status — built

This started as a design record that was explicitly **not** to be acted on.
That changed: it has now been implemented, and this document is kept as the
reasoning behind the code rather than a proposal.

What is built, and where:

| Stage | Files | Model calls |
|---|---|---|
| 1a competitive set | `src/research/competitors.js` | 0 |
| 1b brand understanding | `src/research/brand.js` | 0 |
| 1c local SEO | `src/research/localseo.js` | 0 |
| 2 creative brief | `src/generate/creative-brief.js` | 1 |
| 3 content plan | `src/generate/planner.js` (rewired to consume the brief) | 1 |
| 4 render | `src/generate/renderer.js` (honours art direction) | 1 per page |
| 5 SEO application | `src/generate/seo.js` | 0 |
| 6 QA | `src/generate/qa.js` | 0 |

Two things in the plan below were **not** built, both deliberately:

- **The scored model pass in stage 6.** The thirteen deterministic gates turned
  out to carry the weight, and a model score that never blocks anything is a
  number nobody acts on. `npm run qa` prints the deterministic table across
  every stored site, which is what the "judge a prompt change against the
  corpus" argument actually needed.
- **`src/generate/rubric.js`**, for the same reason.

**Deliberately not committed:** the interactive demo page. It embeds full Google
review text, and committing that to a repository is exactly the caching Google's
terms forbid. The example sites are safe because they contain our own original
copy — no review text reaches them by design.

## Context

The generator today is two stages: plan the content from evidence, then render.
That beats the commodity tools on *truthfulness* — every claim carries
provenance and the plan lists what it refused to say — but it has no research,
no strategy, no art direction, and no definition of "good". It decides what to
say without deciding what the site is **for**, who it is **against**, or what it
should **feel like**.

That is the diagnosis for why Brizy, Lindo, Avvio, Blyn, placessiteai and
Presenvo disappoint. They automate an agency's *deliverables* without automating
its *decisions*, and they start from a single business in isolation.

Sales-cycle placement is undecided (own agency vs. licensing), so every stage
works from evidence alone and *improves* when client input exists. Nothing
requires an interview.

## Where each of your seven items lives

| Your item | Stage | How | Model calls |
|---|---|---|---|
| Competitor research | 1a | The 60 businesses already scanned per search, plus 2-3 rival homepages fetched | 0-1 |
| Keyword research → local SEO | 1c + 5 | Query patterns from category + geography; schema, meta, NAP applied at render | 0 |
| Brand research | 1b → 2 | Name semantics, review language, category conventions → brief | folded into 2 |
| Site navigation | 3 | Content plan, derived from the conversion goal | exists |
| Content creation | 3 + 4 | Plan, then render | exists |
| Design and photos | 2 (direction) + 4 (applied) | Art direction in the brief; image ladder below | folded into 2 |
| QA | 6 | Deterministic gates + one scored pass | 0 for gates |

Six stages, four model-call types, one click. Three of the six are code, not
prompts — which is why adding them costs latency measured in milliseconds.

## Stage 1 — Research (parallel, nearly free)

**1a. Competitive set.** The prospecting run already stores every business in
the category and city with rating, review count and validated website status.
Three things come out of a SQL query and no model call:

- **Percentile.** "5.0 from 282 reviews puts this shop in the top 3% of 60
  Chicago barbershops" is a fact worth putting on a homepage, and we can only
  say it because we scanned the set.
- **Table stakes.** What do rivals with websites all have that we would look
  amateur without — booking, price range, gallery, service list.
- **Visual differentiation.** If four of five nearby barbershops use dark-plus-
  gold with script type, using it too makes the business invisible. This feeds
  art direction directly, and is the single best argument for doing competitor
  research at all.

Optionally one fetch of the two nearest rivals' homepages to read their actual
claims, so positioning can avoid claiming what everyone claims.

**1b. Brand understanding.** Deterministic inputs assembled for the brief: the
trading name and what it signals (*Blessed Hands Barber **Parlor*** carries
craft, faith and old-school refinement before anyone writes a word), the
vocabulary customers actually use in reviews, category conventions, and the
observed palette from `vision.js` when photos were read.

**1c. Local SEO.** Almost entirely code. Query patterns from category plus
geography ("barber near me", "fade Chicago", "barbershop 60607"), the service
area implied by the address, the right schema.org type, and the canonical NAP
block. Keyword *research* is a national-SEO frame; for these businesses ranking
happens through Google Business Profile, NAP consistency and schema.

## Stage 2 — Creative brief (1 call)

Positioning and art direction are the same decision, made by the same person, in
the same sitting. Splitting them is how copy and design end up arguing.

- **Strategy** — `conversionGoal` (call / book / visit / quote / order),
  `audiences[]` with intent state (emergency, comparing, loyal, discovering),
  `positioning` with the claim, its proof, and explicit *parity* items that are
  true but not differentiating so they never get hero treatment, `mustNotSay`.
- **Art direction** — `designKey` chosen from the 74 systems **with a written
  rationale that cites the competitive set**, `paletteOverride` from observed
  storefront colours, `typeRegister`, `layoutArchetype`, `imageStrategy`.

**The design system gets chosen, not picked by the user.** Today the operator
selects one of 74 from a dropdown — input we should eliminate. The brief picks
it and justifies it ("dark editorial, single hot accent: four of five local
rivals use cream and script"). The dropdown remains as an override.

Borrowing from 74 well-analysed systems is the best quality-per-effort route to
a coherent professional look without a designer. The failure mode was never that
it is borrowed — it is that the choice was unjustified. Evidence-backed
selection plus a palette from the real storefront gets most of the way to
bespoke at a fraction of the cost.

## Stages 3-4 — Content plan and render

Exist. Rewired so the planner consumes the brief instead of inventing `tagline`
and `voice` inline, every page's `purpose` traces to the conversion goal, and
the renderer honours `paletteOverride`.

## Stage 5 — SEO application (0 calls)

Deterministic, at render: LocalBusiness JSON-LD with hours, geo and rating;
title and meta per page; `sitemap.xml` and `robots.txt`; Open Graph; canonical;
one NAP block that matches the Google listing character for character. Plus a
GBP recommendations list for the owner — for a barbershop that is plausibly
higher ROI than the website itself.

## Stage 6 — QA (0 calls for the gates)

`src/generate/qa.js` and `rubric.js`. Runs after render, gates publish.

- **Verbatim-reuse detector.** N-gram overlap between rendered text and source
  review text. Today "never quote reviews" is a prompt instruction I have been
  asserting holds; this proves it per build. Hard fail.
- **Evidence integrity.** Every heading and body string traces to a plan
  section. Hard fail on claims that appeared during rendering.
- **Placeholder honesty.** Every `[[ADD: ...]]` survives into the HTML.
- **Brief compliance.** Primary CTA matches `conversionGoal`, above the fold,
  every page. Nothing from `mustNotSay` appears.
- **Self-containment.** No external `src`/`href` — reuse the `importer.js` check.
- **Accessibility.** Heading order, landmarks, labelled controls, focus, contrast.
- **Technical.** Title/meta length, `tel:` link, schema validity, page weight.

One cheap model call scores design fidelity (did it use the tokens or merely
approximate them?) and copy quality. Scored, never a hard gate.

`src/cli/eval.js` runs the rubric across every stored site and prints a table,
so a prompt change is judged against the corpus rather than one lucky output.
This is the answer to "the quality I wish to achieve" — it makes the bar
explicit and regressions visible.

## The image sourcing ladder

Your ordering was social → Google reviews → AI. Two rungs need constraints in
code, not judgement:

1. **Client-supplied, or their own social with permission.** Best quality,
   unambiguously licensed, the only rung that lifts the ceiling.
2. **Their social scraped without permission.** Against Facebook and Instagram
   terms, technically unreliable. Not built.
3. **Google review photos — vision input only, never published.** Built already.
   Google's terms exempt only `place_id` from the no-caching rule and require
   live fetch with author attribution; a static file can do neither. Read once,
   keep the derived palette and scene description, discard the bytes. Informs
   design; cannot fill the frame.
4. **AI-generated.** Abstract or textural only, never a depiction of the real
   premises. A fabricated interior of a real business is disproved by walking in.
5. **Designing around the absence.** Typography, colour, CSS texture, marked
   slots. Default until a real photo exists.

## One thing I would still not build

**A generated logo.** For a business at this budget an AI mark is worse than
their name well set in the chosen type system. A wordmark derived from the type
register is what a good agency ships here. Cheap, better, and it cannot look
uncanny.

## What the gates actually check

Thirteen of them, seven blocking and six advisory. The split is the whole design:
blocking means the site is wrong or dangerous, advisory means it is worse than
it should be. Mixing the two produces a score that nobody can act on.

Blocking: review wording (n-gram overlap against the source reviews, threshold
five words), reviewer names, claims present in neither the plan nor the
evidence, a phone number that is not theirs, external resources, anything from
the brief's `mustNotSay`.

Advisory: the conversion action on every page and above the fold, planned
placeholders surviving as placeholders, accessibility (landmarks, heading
order, labelled controls, focus), the technical head budget, JSON-LD presence
and validity, and whether the design system's tokens were actually used rather
than approximated.

`npm run qa` re-runs all of it across every stored site and prints the table.
It is deterministic, so it costs nothing and runs in CI.

## Three bugs this found in its own first draft

Worth recording, because each one is a category of mistake rather than a typo.

1. The claim detector ran on word-level text, which strips every character that
   is not a letter or a digit. A price is `$25` and an email address is
   punctuation held together by letters, so the two most obviously dangerous
   patterns could never match anything. A gate that cannot fail looks exactly
   like a gate that passes.
2. "Family-owned" on the page did not match "family owned" in the plan, so a
   claim the plan had properly made *with evidence attached* was reported as
   invented. A provenance check defeated by a hyphen is not a provenance check.
3. The hue buckets put `#c9a227` and `#b8860b` on opposite sides of a boundary.
   Two shades of gold are precisely the case "do the rivals look alike" exists
   to catch.

## Files

- New: `src/research/competitors.js`, `src/research/brand.js`,
  `src/research/localseo.js`, `src/generate/creative-brief.js`,
  `src/generate/seo.js`, `src/generate/qa.js`, `src/cli/qa.js`,
  `src/cli/site.js`, `src/maps-link.js`
- Renamed: `src/generate/brief.js` → `handoff.js`, `src/cli/brief.js` →
  `handoff.js`. Two things called "brief" in a codebase about briefs was going
  to cause an accident: one is the strategy document the model writes, the
  other is the handoff for generating by hand without a key.
- Modified: `schema.js` (brief schema, `validateBrief`, `planHonoursBrief`),
  `planner.js`, `renderer.js`, `generator.js`, `importer.js` (imported sites go
  through stages 5 and 6 too), `db.js`, `publish.js`, `server.js`,
  `public/*`, `selftest.js`

## Verification

1. `npm run check` — 132 assertions, 81 of them new. The verbatim detector
   catches a copied sentence and clears original prose about the same subject;
   the claim gate catches an injected credential, founding year, price and
   email address and allows through a claim the plan actually made; the
   competitive set excludes a peer 30 km away and reports "insufficient" below
   four peers.
2. `npm run qa` across all stored sites; the table reads sensibly and exits
   non-zero when any site is blocked.
3. Stage 1 verified end to end against a seeded set of eight barbershops: six
   peers inside the radius, one excluded at 30 km, percentile and rank correct.

Still outstanding, needing an `ANTHROPIC_API_KEY` this environment does not
have: re-rendering K Cuts, Sippers and Blessed Hands through the full six
stages and confirming the brief cites the competitive set in its design
rationale. The examples in `examples/` predate the brief stage, so they are a
baseline for the QA gates but not yet for the brief.
