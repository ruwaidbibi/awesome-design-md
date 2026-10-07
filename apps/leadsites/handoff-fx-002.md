# Build a website for Murray Hill Barber Co

Three stages. The brief decides the strategy and the art direction, the plan
decides what each section says and on what evidence, then the pages get built.
Everything you are allowed to know is in this document; nothing else about this
business is true.

- Business: Murray Hill Barber Co
- Category: barber shop
- Design system: **your choice** - stage 1 picks it from the catalogue below
- Place id: fx-002

When you are done, save the results like this and run the import:

    <dir>/brief.json     the creative brief
    <dir>/plan.json      the content plan
    <dir>/index.html     the home page
    <dir>/<slug>.html    one file per other page in the plan

    npm run import -- fx-002 --dir <dir>

The import re-runs the deterministic stages for you: it applies the SEO head
block and JSON-LD, then runs the QA gates and refuses to mark the site
publishable if a hard gate fails.


---

## The research (already done, stage 1)

This is computed from data already held, not from a model. Treat every number
as a fact and anything absent as unknown.

### Competitive set

```json
{
  "basis": "insufficient",
  "peerCount": 0,
  "radiusKm": 8,
  "note": "No peers of this trade have been scanned, so there is no competitive set. Nothing on the site may claim a ranking or a comparison.",
  "peers": []
}
```

### What the local rivals' sites look like

```json
{
  "basis": "not-researched",
  "read": 0,
  "failed": 0,
  "tableStakes": null,
  "note": "No rival homepage could be read, so nothing here is observed. Do not assert what rivals do or do not do."
}
```

### Brand signals

```json
{
  "name": {
    "full": "Murray Hill Barber Co",
    "trading": "Murray Hill Barber Co",
    "suffix": null,
    "wordCount": 4,
    "signals": [
      "trade stated plainly in the name",
      "formal, heritage-leaning register"
    ],
    "wordmarkNote": "Short enough to set on one line at display size."
  },
  "conventions": {
    "customerDecides": "on proof of skill and whether they can get in today",
    "conventional": [
      "dark walls with a gold or red accent",
      "script or slab wordmark",
      "pole motif",
      "chair photography"
    ],
    "expects": [
      "who cuts",
      "how to book or whether walk-ins are taken",
      "where to park"
    ],
    "conversion": "call"
  },
  "vocabulary": [
    {
      "word": "shave",
      "reviewsMentioning": 2,
      "uses": 2
    },
    {
      "word": "trim",
      "reviewsMentioning": 2,
      "uses": 2
    }
  ],
  "vocabularyBasis": "Words used by at least two of 5 reviewers. Counts only - no phrase from a review travels past this point.",
  "observedPalette": [],
  "observedScene": null
}
```

### Local search

```json
{
  "schemaType": "HairSalon",
  "categoryLabel": "barber shop",
  "address": {
    "full": "1054 Edgewood Ave S, Jacksonville, FL 32205",
    "street": "1054 Edgewood Ave S",
    "city": "Jacksonville",
    "state": "FL",
    "postalCode": "32205",
    "country": null
  },
  "serviceArea": "Jacksonville",
  "queryPatterns": [
    {
      "query": "barber near me",
      "intent": "nearby",
      "surface": "map pack"
    },
    {
      "query": "barber Jacksonville",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "barber 32205",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "barbershop near me",
      "intent": "nearby",
      "surface": "map pack"
    },
    {
      "query": "barbershop Jacksonville",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "barbershop 32205",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "haircut near me",
      "intent": "nearby",
      "surface": "map pack"
    },
    {
      "query": "haircut Jacksonville",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "haircut 32205",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "fade near me",
      "intent": "nearby",
      "surface": "map pack"
    },
    {
      "query": "fade Jacksonville",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "fade 32205",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "beard trim near me",
      "intent": "nearby",
      "surface": "map pack"
    },
    {
      "query": "beard trim Jacksonville",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "beard trim 32205",
      "intent": "local",
      "surface": "map pack"
    },
    {
      "query": "Murray Hill Barber Co",
      "intent": "branded",
      "surface": "knowledge panel"
    },
    {
      "query": "Murray Hill Barber Co Jacksonville",
      "intent": "branded",
      "surface": "knowledge panel"
    },
    {
      "query": "best barber in Jacksonville",
      "intent": "comparison",
      "surface": "organic + map pack"
    },
    {
      "query": "barber open now",
      "intent": "immediate",
      "surface": "map pack"
    }
  ],
  "nap": {
    "name": "Murray Hill Barber Co",
    "address": {
      "full": "1054 Edgewood Ave S, Jacksonville, FL 32205",
      "street": "1054 Edgewood Ave S",
      "city": "Jacksonville",
      "state": "FL",
      "postalCode": "32205",
      "country": null
    },
    "phone": "(904) 555-0119",
    "mapsUrl": "https://maps.google.com/?cid=fx-002",
    "warning": "These strings must match the Google Business Profile character for character wherever they appear. Do not reformat the phone number or abbreviate the street."
  },
  "note": "Query patterns are generated from category and geography. No search volumes are available to this tool and none are implied."
}
```

---

## Stage 2 instructions (the brief)

You are the strategist and art director on a small agency team, writing the brief for one real local business's website.

You get the research the team has already done: verified facts, what customers say, the competitive set, what the trade's conventions are, and a catalogue of design systems to choose from. You return the brief. Copy and HTML are written by other people, later, from what you decide here.

## Truthfulness (the hard constraint)

This describes a REAL business to REAL customers. Every factual claim must trace back to the evidence you were given.

NEVER invent: testimonials or review quotes, customer or staff names, awards, certifications, licences, years in business, "family owned since 1974", employee counts, prices, guarantees, email addresses, second locations, or delivery and booking partners.

You MAY state, exactly as supplied: the rating and review count, the address, the phone number, and the opening hours.

## Using the reviews

Reviews are evidence of what this business actually does and is good at.

- A service named across several reviews is real. Feature it.
- A detail mentioned once is weak evidence. Reflect it quietly; never headline it.
- Recurring praise tells you the tone and the selling point. Write to it.
- Where reviews and the verified facts disagree, the facts win.

Three hard limits:

1. NEVER reproduce review text verbatim or near-verbatim, and never place it on the site as a quote or testimonial. Reviews are research, not copy.
2. NEVER name, quote, or allude to an individual reviewer.
3. NEVER repeat a complaint, and never write defensively about one.

## The job

A brief is a set of decisions, not a description. Every field should close off an argument that would otherwise happen during production.

**The conversion goal is one action.** Not "contact us" - call, book, visit, quote or order. Choose it from how this category's customers actually decide, not from what is tidiest. Someone whose car will not start is not going to fill in a form. Only choose "book" or "order" if the evidence contains a real place to do it; inventing a booking flow is inventing a fact.

**Positioning needs a claim, its proof, and its parity items.** The parity list is the part people skip and it is the most useful thing in the brief: things true of this business and equally true of every rival. "Experienced barbers", "quality service", "friendly staff" - all true, all worthless in a hero, because the shop next door says them too. Name them so production knows not to lead with them.

**mustNotSay is a real constraint, not a disclaimer.** Put in it: anything unsupported by evidence, anything the reviews actually disagree about, and anything every rival claims. If reviews are split on service quality, "friendly service" belongs in mustNotSay - a promise like that is what an unhappy customer quotes back at you.

## Choosing the design system

You must choose exactly one key from the catalogue, and the rationale is the point. Two tests:

1. **Fit.** Does the register match the business? A faith-referencing barber parlour and a self-described express cut-and-go are not the same brand and must not get the same system.
2. **Differentiation.** You were shown what the local rivals look like. If most of them share a palette or a type register, taking it too makes this business invisible in the one place it is compared - a phone screen showing three tabs. Say in the rationale what the rivals look like and how this choice differs.

If no competitive set was available, say that plainly in the rationale. Do not imply research you were not given.

Only set paletteOverride when a colour was actually observed at the premises, or when the chosen system's palette collides with the local norm. Each override states why.

No generated logo. For a business at this budget an AI mark is worse than their own name well set, so wordmark is a typographic treatment from the system you chose.

**There are no real photographs available to this site.** Google's terms do not allow a place photo to be republished, and we will not fabricate an interior of a real business that a customer can walk into. imageStrategy decides what carries the page instead.

## Navigation

Derive the pages from the conversion goal. Every page has to answer "what does this do for the goal"; if it cannot, do not include it. Five pages maximum, and two strong pages beat five thin ones. There is always an "index".

Do not plan a menu, price list, team or testimonials page - we have none of that information and must not invent it. If rival sites all have one, that belongs in tableStakes as "cannot-supply" or "need-from-owner", which is an honest answer.

---

### The design systems to choose from (74)

Each lives at `design-md/<key>/DESIGN.md` in this repository. Choose one key,
then read that file before stage 4.

- `airbnb` — Airbnb (primary #ff385c): A warm, generous consumer marketplace anchored on a clean white canvas and Airbnb Rausch (#ff385c), the single brand voltage that carries every primary CTA, search-button orb, and rating dot. Type runs Airbnb Cereal VF at modest weights — display sits at 22...
- `airtable` — Airtable (primary #181d26): A sober, editorial workflow-software interface anchored on white canvas and dark-ink type, where brand voltage comes from full-bleed signature cards in coral, dark green, peach, and dark navy that punctuate long-scroll explainer pages. Primary actions use a...
- `apple` — Apple (primary #0066cc): A photography-first interface that turns marketing into a museum gallery. Edge-to-edge product tiles alternate light and dark canvases, framed by SF Pro Display headlines with negative letter-spacing and a single Action Blue (#0066cc) interactive color. UI ...
- `binance` — Binance (primary #fcd535): A confident financial-platform interface anchored on a deep near-black canvas, where Binance's iconic yellow (#FCD535) carries every primary CTA, brand accent, and value-claim moment. Type runs Binance's custom BinanceNova / BinancePlex stack at modest weig...
- `bmw` — Bmw (primary #1c69d4): BMW's corporate site — distinct from BMW M's motorsport-bombastic variant, this is a measured and settled corporate-automotive interface. On a light (cream-tinted white) canvas, BMW corporate blue (#1c69d4) carries every primary CTA; dark navy hero bands fr...
- `bmw-m` — Bmw M (primary #ffffff): A motorsport-engineering interface anchored on a near-black canvas with white BMW Type Next Latin display headlines in confident UPPERCASE. The brand carries no decorative voltage — its energy comes from full-bleed automotive photography (cars on tracks, dr...
- `bugatti` — Bugatti (primary #ffffff): An austere luxury-automotive interface that uses near-pure black canvas, white uppercase letterspaced display, and full-bleed automotive photography as the only voltage. The system runs three custom Bugatti typefaces — Bugatti Display, Bugatti Text Regular,...
- `cal` — Cal (primary #111111): A clean, calendar-software-first interface anchored on white canvas with black primary CTAs and custom Cal Sans display typography. The system reads as friendly modern SaaS — generous whitespace, soft-rounded cards (~12px), product UI fragments shown direct...
- `claude` — Claude (primary #cc785c): A warm-canvas editorial interface for Anthropic's Claude product. The system anchors on a tinted cream canvas with serif display headlines, warm coral CTAs, and dark navy product surfaces (code editor mockups, model showcase cards). Brand voltage comes from...
- `clay` — Clay (primary #0a0a0a): A vibrant claymation-meets-data interface for Clay.com (GTM data-orchestration platform). Anchors on white canvas with dark-navy primary CTAs, custom rounded display type, and saturated single-color feature cards — hot pink, deep teal, lavender, peach, ochr...
- `clickhouse` — Clickhouse (primary #faff69): A high-performance database interface anchored on near-pure black canvas with electric yellow as the brand voltage. White typography in confident sans, yellow CTAs, and yellow-text stat numbers carry the brand voice across every page. Code blocks and produc...
- `cohere` — Cohere (primary #17171c): Cohere's 2026 web system is a controlled enterprise AI interface built from stark white editorial space, deep green-black product bands, soft mineral surfaces, rounded media cards, and a distinctive type split between monospaced-feeling display headlines an...
- `coinbase` — Coinbase (primary #0052ff): An institutional-grade crypto exchange whose marketing surfaces read like a quietly-confident financial-services brand. The base canvas is pure white; Coinbase Blue (`#0052ff`) is the single brand voltage, used scarcely on primary CTAs, signature glyphs, an...
- `composio` — Composio (primary #0007cd): A developer-tools brand for AI-agent tool integration whose marketing surfaces lean into a dark, technical aesthetic with a single deep-electric-blue voltage (`#0007cd`). The page floor is near-black (`#0f0f0f`); cards float above on subtle gray-tinted surf...
- `cursor` — Cursor (primary #f54e00): An AI-first code editor whose marketing site reads like a quietly-confident developer-tools brand with a warm-cream editorial canvas (`#f7f7f4`) instead of the typical dark IDE atmosphere. Near-black warm ink (`#26251e`) carries body and display alike — dis...
- `dell-1996` — Dell 1996 (primary #e91d2a): An inspired interpretation of Dell.com's 1996 design language — a catalog-era enterprise web design built around a literal black page frame, vivid flat color-block "ribbon cards" tinted in sage, salmon, periwinkle, sky, peach and lime, chunky Helvetica-Blac...
- `elevenlabs` — Elevenlabs (primary #292524): A voice-AI brand whose marketing surfaces read like a quietly editorial print magazine. The base canvas is off-white (`#f5f5f5`) holding warm near-black ink (`#292524`); the brand voltage is photographic, not chromatic — soft pastel atmospheric gradient orb...
- `expo` — Expo (primary #000000): A React Native developer-platform whose marketing site reads like a quietly-confident infrastructure brand. The base canvas is pure white with a soft sky-blue gradient atmospheric wash behind the hero; near-black ink (`#171717`) carries body and display ali...
- `ferrari` — Ferrari (primary #da291c): A luxury-automotive brand whose marketing surfaces read as cinematic editorial. The base canvas is **near-black** (`#181818`) holding pure white display type; white-canvas bands appear only inside specific editorial contexts (preowned listings, pricing tabl...
- `figma` — Figma (primary #000000): A confident black-and-white editorial frame interrupted by oversized, hand-cut pastel color blocks. The marketing canvas is rigorously monochrome — figmaSans variable type, pure white surfaces, pure black ink, pill-shaped CTAs — while each story section dro...
- `framer` — Framer (primary #ffffff): A confident dark-canvas builder marketing site that treats the page like a working artboard — pure black surfaces, white display type set in GT Walsheim Medium with aggressive negative tracking, and a single confident blue (#0099ff) reserved for hyperlinks ...
- `hashicorp` — Hashicorp (primary #000000): An enterprise-infrastructure marketing canvas built around a near-black ground (#000000) and a system of per-product accent colors — Terraform purple, Vault yellow, Consul pink, Waypoint cyan, Vagrant blue — that act as identity tokens rather than decorativ...
- `hp` — HP (primary #024ad8): An inspired interpretation of HP's design language — a white-paper enterprise-consumer system anchored by HP Electric Blue (`#024ad8`) as the lone signal CTA, near-black ink (`#1a1a1a`) for headlines, geometric Forma-DJR sans throughout, and angular blue-ch...
- `ibm` — Ibm (primary #0f62fe): An enterprise-marketing canvas faithful to Carbon Design System: white surfaces, charcoal type, IBM Blue (#0f62fe) as the single confident accent, and a deliberately flat-square aesthetic where corners stay at 0–4px. Type runs IBM Plex Sans at light weight ...
- `intercom` — Intercom (primary #111111): An editorial customer-service marketing canvas built around a soft cream-white ground, charcoal type set in Saans (Intercom's proprietary geometric sans), and a single confident Fin Orange (#ff5600) reserved for the Fin AI brand. Cards live as floating whit...
- `kraken` — Kraken: no description
- `lamborghini` — Lamborghini: no description
- `linear.app` — Linear.app (primary #5e6ad2): A near-black product-focused marketing canvas built around #010102 (the deepest dark surface of any tool in this collection), light gray text (#f7f8f8), and the signature Linear lavender-blue (#5e6ad2) used as the single chromatic accent. The system reads a...
- `lovable` — Lovable: no description
- `mastercard` — Mastercard: no description
- `meta` — Meta (primary #0064e0): Meta's design system spans hardware commerce (Quest VR, Ray-Ban Meta AI glasses) and brand surfaces with a confident product-merchandising voice. The system pairs a stark white canvas with full-bleed photographic product cards, a confident Optimistic VF wor...
- `minimax` — Minimax (primary #0a0a0a): MiniMax presents itself as a premium AI infrastructure brand through a striking duality — bold black-pill CTAs and stark white canvas for marketing, paired with vibrant gradient product cards (orange-red, magenta-pink, purple, blue) that turn each model rel...
- `mintlify` — Mintlify (primary #0a0a0a): Mintlify presents documentation infrastructure with a dual-mode aesthetic — atmospheric sky-gradient marketing heroes (cloud illustration backdrops, soft cream-to-blue washes) paired with dense developer-grade documentation surfaces. The system uses Inter f...
- `miro` — Miro (primary #1c1c1e): Miro presents itself as the AI-powered visual workspace through a confident, almost playful brand voice — anchored by its signature canary yellow ({colors.brand-yellow}) wordmark over white canvas, broken open by colorful pastel feature tints (rose, teal, c...
- `mistral.ai` — Mistral.ai (primary #fa520f): Mistral AI brands itself with a singular signature — atmospheric sunset gradients (mustard, orange, deep red) layered over photography of mountains, plus a horizontal "sunset stripe" bar that closes every page. The system pairs warm cream-yellow surfaces ({...
- `mongodb` — Mongodb (primary #00ed64): MongoDB carries a strong dual-mode visual identity — dark deep-teal hero bands with bright MongoDB green ({colors.brand-green}) CTAs paired with stark white documentation surfaces. The signature green pill button is unmistakable across product, pricing, lea...
- `nike` — Nike (primary #111111): |
- `nintendo-2001` — Nintendo 2001 (primary #e60012): An analysis of Nintendo.com's 2001 design language — a brushed-periwinkle "console chrome" interface where every panel is a beveled metal plate, navigation glows amber over a halftone-dotted carbon bar, and bold outlined display type sits on circuit-board h...
- `notion` — Notion (primary #5645d4): Notion presents itself as the all-in-one workspace through a confident, illustration-rich brand voice — anchored by a deep navy hero band ({colors.brand-navy}) decorated with brand-colored sticky-note dots and mesh wire illustrations, a signature purple pil...
- `nvidia` — Nvidia (primary #76b900): |
- `ollama` — Ollama (primary #000000): |
- `opencode.ai` — Opencode.ai (primary #201d1d): |
- `pinterest` — Pinterest (primary #e60023): |
- `playstation` — Playstation (primary #0070d1): |
- `posthog` — Posthog (primary #f7a501): |
- `raycast` — Raycast (primary #ffffff): |
- `renault` — Renault (primary #ffed00): |
- `replicate` — Replicate (primary #ea2804): |
- `resend` — Resend (primary #fcfdff): |
- `revolut` — Revolut (primary #494fdf): |
- `runwayml` — Runwayml: no description
- `sanity` — Sanity: no description
- `sentry` — Sentry (primary #150f23): An inspired interpretation of Sentri's design language — a developer-tools brand built on a deep purple-violet midnight canvas, electric lime accents, and a slightly subversive illustrated personality. The system pairs a custom display sans (chunky, playful...
- `shopify` — Shopify (primary #000000): An inspired interpretation of Shopifi's design language — a cinematic commerce platform that runs two parallel design tracks. The marketing-hero and product-narrative pages live on near-black canvases with full-bleed photography of merchants, giant Neue Haa...
- `slack` — Slack (primary #4a154b): An inspired interpretation of Slacc's design language — a workplace messaging brand built on a deep aubergine primary, with cream-lavender hero gradients, blue inline links, and pill CTAs. The system pairs a proprietary humanist sans for display with a sepa...
- `spacex` — Spacex (primary #000000): An inspired interpretation of Spasex's design language — a mission-oriented aerospace brand built on pure black canvas, full-bleed photographic and video heroes of rockets and Mars landscapes, and uppercase D-DIN display type set in tight vertical leading. ...
- `spotify` — Spotify: no description
- `starbucks` — Starbucks: no description
- `stripe` — Stripe (primary #533afd): An inspired interpretation of Stripi's design language — a financial-infrastructure brand built on a deep navy ink, an electric indigo primary, and a recurring atmospheric gradient mesh that occupies the upper third of nearly every marketing page. The syste...
- `supabase` — Supabase (primary #3ecf8e): An inspired interpretation of Supabaze's design language — an open-source database platform built on a clean white-and-near-black system with a single signature emerald-green CTA, a custom humanist sans display tier, and dense product UI mockups composited ...
- `superhuman` — Superhuman (primary #1b1938): An inspired interpretation of Superhumon's design language — a fast-email productivity brand split between an editorial dark hero (deep indigo navy with violet-sky atmospheric backdrop and a portrait subject) and a quiet white content body with off-warm-gre...
- `tesla` — Tesla: no description
- `theverge` — Theverge: no description
- `together.ai` — Together.ai (primary #000000): An inspired interpretation of Together AI's design language — an AI infrastructure platform whose surface alternates between near-black hero bands (with a three-color orange-magenta-periwinkle gradient as the single piece of brand chrome) and bright white r...
- `uber` — Uber (primary #000000): An inspired interpretation of Uber's design language — a transportation-and-delivery super-app brand whose web surface is a black-and-white duet, framed by a custom geometric display sans, accented by a single signature pill shape (radius 999px) on every in...
- `vercel` — Vercel (primary #171717): An inspired interpretation of Vercel's design language — a developer-platform brand whose surface is a stark black-and-ink duet on near-white canvas, broken at hero scale by a multi-color mesh gradient (cyan / blue / magenta / amber) that acts as the entire...
- `vodafone` — Vodafone (primary #e60000): An inspired interpretation of Vodafone's design language — a telecom super-brand whose web surface alternates between editorial photography hero bands with massive uppercase display headlines and clean white content bands, anchored by the company's signatur...
- `voltagent` — Voltagent (primary #00d992): An inspired interpretation of Voltagent's design language — a developer-focused AI agent engineering platform whose surface is an unrelenting near-black canvas broken only by a single electric-green brand accent, code-editor mockups inside the hero, and a p...
- `warp` — Warp (primary #f7f5f0): An inspired interpretation of Warp's design language — an agentic terminal-and-development-environment brand whose surface is a warm near-charcoal canvas (a tint warmer than pure black), broken only by clean Inter typography, the occasional Instrument Serif...
- `webflow` — Webflow (primary #080808): An inspired interpretation of Webflow's design language — a visual web development platform whose surface contrasts a deep near-black `#080808` primary against a generous white canvas, broken by a five-stop chromatic accent system (purple / pink / blue / or...
- `wired` — Wired (primary #000000): An inspired interpretation of Wired's design language — a flagship technology-magazine brand whose surface is a strict editorial duet of stark black wordmark on white canvas, anchored by a tall narrow custom display serif for hero headlines, a humanist seri...
- `wise` — Wise (primary #9fe870): An inspired interpretation of Wise's design language — a global money-transfer brand whose surface combines an unusually heavy near-black display sans (weight 900 at 64–126 px) with a vivid lime-green brand accent, sage-tinted surface neutrals, and rounded ...
- `x.ai` — X.ai (primary #ffffff): An inspired interpretation of xAI's design language — Elon Musk's frontier-AI company whose web surface is a strict near-black canvas broken only by white pill outlines, occasional warm sunset / dusk gradient accents, a custom geometric sans (Universal Sans...
- `zapier` — Zapier (primary #ff4f00): An inspired interpretation of Zapier's design language — a workflow-automation platform whose surface combines warm-cream neutrals (`#fffefb` canvas, `#f8f4f0` soft cream) with deep coffee ink (`#201515`) and a single saturated orange CTA accent (`#ff4f00`)...

---

### The brief's required shape

Return JSON matching this schema exactly, as `brief.json`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "conversionGoal",
    "conversionRationale",
    "audiences",
    "positioning",
    "voice",
    "artDirection",
    "navigation"
  ],
  "properties": {
    "conversionGoal": {
      "type": "string",
      "enum": [
        "call",
        "book",
        "visit",
        "quote",
        "order"
      ],
      "description": "The one action the whole site exists to produce. Only choose 'book' or 'order' if a real booking or ordering destination exists in the evidence."
    },
    "conversionRationale": {
      "type": "string",
      "description": "Why that action and not another, in terms of how this category's customers actually decide."
    },
    "audiences": {
      "type": "array",
      "minItems": 1,
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "who",
          "intentState",
          "needsToSee"
        ],
        "properties": {
          "who": {
            "type": "string"
          },
          "intentState": {
            "type": "string",
            "enum": [
              "emergency",
              "comparing",
              "loyal",
              "discovering"
            ],
            "description": "What state they arrive in. It decides what goes above the fold."
          },
          "needsToSee": {
            "type": "string",
            "description": "The one thing that converts this person."
          }
        }
      }
    },
    "positioning": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "claim",
        "proof",
        "parity",
        "mustNotSay"
      ],
      "properties": {
        "claim": {
          "type": "string",
          "description": "One sentence. What this business is, better than the alternatives, that the evidence supports."
        },
        "proof": {
          "type": "string",
          "description": "The specific evidence that entitles the claim. Name it."
        },
        "parity": {
          "type": "array",
          "description": "True of this business but equally true of every rival, so it must never get hero treatment. Naming these is how the hero stops being generic.",
          "items": {
            "type": "string"
          }
        },
        "mustNotSay": {
          "type": "array",
          "description": "Phrases and claims this site must not contain, because they are unsupported, contested in the reviews, or what every rival already says.",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "voice": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "register",
        "tagline",
        "dos",
        "donts"
      ],
      "properties": {
        "register": {
          "type": "string",
          "description": "How it sounds, in one sentence, traceable to the evidence."
        },
        "tagline": {
          "type": "string",
          "description": "One original line. No superlative you cannot prove."
        },
        "dos": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "donts": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "artDirection": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "designKey",
        "designRationale",
        "typeRegister",
        "layoutArchetype",
        "imageStrategy",
        "wordmark"
      ],
      "properties": {
        "designKey": {
          "type": "string",
          "description": "One key from the catalogue of design systems you were given. Exact key, not the label."
        },
        "designRationale": {
          "type": "string",
          "description": "Why this system for this business. Cite the competitive set: what the rivals look like and how this differs. If no competitive set was available, say that plainly instead of implying one."
        },
        "rejected": {
          "type": "array",
          "description": "A system you considered and did not choose, and why. One or two.",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "designKey",
              "why"
            ],
            "properties": {
              "designKey": {
                "type": "string"
              },
              "why": {
                "type": "string"
              }
            }
          }
        },
        "paletteOverride": {
          "type": "array",
          "description": "Only when a colour was actually observed at the premises, or the chosen system's palette collides with the local norm. Each entry must say why.",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "role",
              "hex",
              "why"
            ],
            "properties": {
              "role": {
                "type": "string",
                "enum": [
                  "primary",
                  "accent",
                  "surface",
                  "ink"
                ]
              },
              "hex": {
                "type": "string",
                "description": "#rrggbb"
              },
              "why": {
                "type": "string"
              }
            }
          }
        },
        "typeRegister": {
          "type": "string",
          "description": "The typographic register in words, e.g. 'condensed grotesque for headings, plain humanist for body'."
        },
        "layoutArchetype": {
          "type": "string",
          "enum": [
            "single-column-editorial",
            "split-hero",
            "full-bleed-image",
            "card-grid",
            "centred-minimal",
            "sidebar-utility"
          ]
        },
        "imageStrategy": {
          "type": "string",
          "enum": [
            "type-and-colour-only",
            "css-texture",
            "marked-photo-slots",
            "abstract-generated"
          ],
          "description": "No real photograph of these premises is available to the site, so this decides what fills the frame instead."
        },
        "wordmark": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "treatment"
          ],
          "properties": {
            "treatment": {
              "type": "string",
              "description": "How the name is set. A wordmark from the type system - never a generated logo mark."
            },
            "note": {
              "type": "string"
            }
          }
        }
      }
    },
    "navigation": {
      "type": "array",
      "minItems": 1,
      "maxItems": 5,
      "description": "The pages, decided from the conversion goal rather than a template. The planner must honour this.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "label",
          "slug",
          "why"
        ],
        "properties": {
          "label": {
            "type": "string",
            "description": "Two words at most."
          },
          "slug": {
            "type": "string",
            "description": "'index' for the home page; otherwise lowercase hyphenated."
          },
          "why": {
            "type": "string",
            "description": "What this page does for the conversion goal. If you cannot answer, drop the page."
          }
        }
      }
    },
    "tableStakes": {
      "type": "array",
      "description": "What rival sites have that this one would look amateur without, and whether we can supply it.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "item",
          "status"
        ],
        "properties": {
          "item": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "have",
              "need-from-owner",
              "cannot-supply"
            ],
            "description": "'cannot-supply' is an honest answer: we have no prices, no menu and no real photographs."
          }
        }
      }
    },
    "risks": {
      "type": "array",
      "description": "What could make this site wrong or embarrassing, from the evidence you were given.",
      "items": {
        "type": "string"
      }
    }
  }
}
```

---

## Stage 3 instructions (the planner)

You plan small marketing websites for local businesses, from evidence.

You are given what is actually known about one real business: verified facts from Google, what its customers say in reviews, sometimes what its photos show, and sometimes notes from the person running this tool. Usually you are also given a creative brief that has already decided the strategy. You return a content plan: which pages the site should have, what each section says, and - for every section - which piece of evidence entitles you to say it.

## Truthfulness (the hard constraint)

This describes a REAL business to REAL customers. Every factual claim must trace back to the evidence you were given.

NEVER invent: testimonials or review quotes, customer or staff names, awards, certifications, licences, years in business, "family owned since 1974", employee counts, prices, guarantees, email addresses, second locations, or delivery and booking partners.

You MAY state, exactly as supplied: the rating and review count, the address, the phone number, and the opening hours.

## Using the reviews

Reviews are evidence of what this business actually does and is good at.

- A service named across several reviews is real. Feature it.
- A detail mentioned once is weak evidence. Reflect it quietly; never headline it.
- Recurring praise tells you the tone and the selling point. Write to it.
- Where reviews and the verified facts disagree, the facts win.

Three hard limits:

1. NEVER reproduce review text verbatim or near-verbatim, and never place it on the site as a quote or testimonial. Reviews are research, not copy.
2. NEVER name, quote, or allude to an individual reviewer.
3. NEVER repeat a complaint, and never write defensively about one.

## The brief, when you have one

The brief is a decision already made. It is not a suggestion.

- Plan exactly the pages its navigation lists, with those slugs. If the evidence genuinely cannot fill one, drop it and say so in ownerTodos rather than padding it.
- `tagline` and `voice` come from the brief. Do not invent your own.
- `primaryAction` must be the brief's conversionGoal. A goal of "call" means a tel: link.
- The positioning claim is what the site leads with. The parity list is the opposite: those things are true but every rival says them, so they never get a heading, a hero, or a section of their own.
- Nothing in mustNotSay may appear anywhere in your plan, including in a paraphrase.

## Choosing pages

Where there is no brief, let the evidence decide, not a template. A business with five reviews naming distinct services earns a services page; one with no review text does not. Rules:

- There is always an "index" page.
- Add a page only when you have enough evidence to fill it. Two strong pages beat five thin ones.
- Never exceed five pages.
- A page every local business can support is hours, address, phone and directions. Call it "visit" unless a better name fits.
- Do not plan a menu, price list, team, or testimonials page. You do not have that information and must not invent it.

## Recording evidence

Every section carries an evidence array. Be precise and honest about strength:

- "google-fact" for anything in the verified facts.
- "review" with ref "review 3" for something customers actually said.
- "operator-notes" for what the operator supplied.
- "photo" for what the photo analysis showed.
- "category-norm" for a safe generality about this kind of business that nothing specific supports. Use it honestly and often - it is not a failure, it is the label for filler.

A section whose evidence is entirely "category-norm" must be marked confidence "low". If you cannot get a page above mostly-low confidence, do not plan that page.

## Copy

Write the actual words, not descriptions of words. Body copy should be a few short sentences, in the voice the evidence supports. Where the owner has to supply something, say so in that section's placeholders and in ownerTodos rather than writing a plausible-sounding guess.

In claimsAvoided, list what a careless generator would have written here and you did not, and why nothing supported it. Be specific.

---

### The plan's required shape

Return JSON matching this schema exactly, as `plan.json`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "tagline",
    "voice",
    "primaryAction",
    "pages",
    "ownerTodos",
    "claimsAvoided"
  ],
  "properties": {
    "tagline": {
      "type": "string",
      "description": "One original line. No superlatives you cannot support."
    },
    "voice": {
      "type": "string",
      "description": "How this business should sound, in one sentence, drawn from the evidence."
    },
    "primaryAction": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "label",
        "href"
      ],
      "properties": {
        "label": {
          "type": "string"
        },
        "href": {
          "type": "string",
          "description": "A tel: link, a maps link, or an anchor. Never an invented URL."
        }
      }
    },
    "pages": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "slug",
          "navLabel",
          "title",
          "purpose",
          "sections"
        ],
        "properties": {
          "slug": {
            "type": "string",
            "description": "'index' for the home page; otherwise lowercase words joined by hyphens, e.g. 'services'."
          },
          "navLabel": {
            "type": "string",
            "description": "Two words at most."
          },
          "title": {
            "type": "string",
            "description": "The <title>, including the business name."
          },
          "purpose": {
            "type": "string",
            "description": "One sentence: who this page is for and what it gets them to do."
          },
          "sections": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "kind",
                "heading",
                "body",
                "evidence",
                "confidence"
              ],
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "hero",
                    "services",
                    "about",
                    "proof",
                    "hours",
                    "location",
                    "faq",
                    "cta",
                    "photos-placeholder"
                  ]
                },
                "heading": {
                  "type": "string"
                },
                "body": {
                  "type": "string",
                  "description": "Original prose. Never review text, never a quote."
                },
                "items": {
                  "type": "array",
                  "description": "Named items for a services or FAQ section.",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "name"
                    ],
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "detail": {
                        "type": "string"
                      }
                    }
                  }
                },
                "evidence": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "source",
                      "supports"
                    ],
                    "properties": {
                      "source": {
                        "type": "string",
                        "enum": [
                          "google-fact",
                          "review",
                          "editorial-summary",
                          "operator-notes",
                          "photo",
                          "category-norm"
                        ],
                        "description": "Where this came from. 'category-norm' means it is only a safe generality for this kind of business, not something you were told."
                      },
                      "ref": {
                        "type": "string",
                        "description": "Which one, e.g. 'review 3' or 'opening hours'."
                      },
                      "supports": {
                        "type": "string",
                        "description": "The specific claim this backs up."
                      }
                    }
                  }
                },
                "confidence": {
                  "type": "string",
                  "enum": [
                    "high",
                    "medium",
                    "low"
                  ],
                  "description": "high = stated in the verified facts or named across several reviews. medium = named once. low = a category generality."
                },
                "placeholders": {
                  "type": "array",
                  "description": "What the owner still has to supply here.",
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      }
    },
    "ownerTodos": {
      "type": "array",
      "description": "What the owner must supply before this site is honest and complete.",
      "items": {
        "type": "string"
      }
    },
    "claimsAvoided": {
      "type": "array",
      "description": "Things a generic generator would have written here that you deliberately did not, because nothing supported them.",
      "items": {
        "type": "string"
      }
    }
  }
}
```

---

## Stage 4 instructions (the renderer)

You build small, complete marketing websites for local businesses.

You are given a design system (a DESIGN.md), a content plan that has already decided what the site says and why, and the evidence behind it. You write the HTML.

## Truthfulness (the hard constraint)

This describes a REAL business to REAL customers. Every factual claim must trace back to the evidence you were given.

NEVER invent: testimonials or review quotes, customer or staff names, awards, certifications, licences, years in business, "family owned since 1974", employee counts, prices, guarantees, email addresses, second locations, or delivery and booking partners.

You MAY state, exactly as supplied: the rating and review count, the address, the phone number, and the opening hours.

## Using the reviews

Reviews are evidence of what this business actually does and is good at.

- A service named across several reviews is real. Feature it.
- A detail mentioned once is weak evidence. Reflect it quietly; never headline it.
- Recurring praise tells you the tone and the selling point. Write to it.
- Where reviews and the verified facts disagree, the facts win.

Three hard limits:

1. NEVER reproduce review text verbatim or near-verbatim, and never place it on the site as a quote or testimonial. Reviews are research, not copy.
2. NEVER name, quote, or allude to an individual reviewer.
3. NEVER repeat a complaint, and never write defensively about one.

## Follow the plan

The plan is the decision. Write the sections it lists, on the pages it lists, saying what its copy says. Improve the wording; do not add claims it did not make, and do not drop sections it did make. If a section carries placeholders, render them as visible placeholder elements rather than inventing the missing content:

  <span class="leadsites-todo">[[ADD: two sentences on your story]]</span>
  <div class="leadsites-photo">[[ADD PHOTO: storefront]]</div>

Give .leadsites-todo and .leadsites-photo a dashed outline so unfinished spots are obvious in review.

## Output

- Fully self-contained. All CSS in one <style> block, any JS in one <script> block. No external CSS, JS, fonts, or images of any kind: this is served as a static file with a policy that blocks every outbound request, so an external reference does not degrade, it breaks.
- No <img src> pointing anywhere. Use CSS gradients, CSS shapes, or inline SVG, and leave marked photo slots the owner can fill.
- Responsive from 360px to 1440px. Semantic landmarks (<header>, <nav>, <main>, <footer>), correct heading order, labelled controls, visible focus styles, and text meeting WCAG AA contrast.
- A phone link (<a href="tel:...">) and a Google Maps link wherever a customer would want one.
- A contact form only if it needs no backend: prefer a tel: or mailto: call to action.

## Design fidelity

Use the DESIGN.md as a real design system: its colour tokens, type scale, spacing, radii, and component patterns, adapted to this business's category and tone. Declare its tokens as CSS custom properties on :root and build from them rather than hard-coding values throughout. Borrow the visual language only. Never copy the source brand's name, logo, wordmark, product names, or marketing copy onto the site, and never imply any affiliation with it.

## Art direction, when the brief supplies it

The brief's artDirection is a decision, not a suggestion, and it overrides your own instinct.

- `paletteOverride` replaces that role's token in the system. Use the exact hex. Each one was chosen for a stated reason - usually a colour actually observed at the premises, or because the system's own colour is what every local rival already uses.
- `layoutArchetype` is the structure of the home page. Build that structure.
- `imageStrategy` decides what fills the frame, and there are no real photographs of this business available to you. "type-and-colour-only" means the typography and palette carry the page. "css-texture" means gradients, patterns and shapes built in CSS. "marked-photo-slots" means visible, labelled slots the owner fills later. "abstract-generated" means inline SVG that is abstract or textural - never a depiction of these premises, because a customer can walk in and disprove it.
- `wordmark` is how the business's name is set, using the chosen type system. Never draw a logo mark or monogram unless the wordmark treatment asks for one.
- The primary action from the plan belongs above the fold on every page, and it is the single most prominent interactive element.

### How the pages fit together

Write the home page as a complete HTML document, including a shared header with
navigation and a shared footer. Write every other page as a complete document
too, reusing that page's stylesheet, header and footer verbatim so the site is
visually identical page to page.

Navigation hrefs are the page slugs: `index.html`, `services.html`, and so on.
Mark the current page with `aria-current="page"` on its own nav link.

Do not write a `<title>`, meta description, canonical tag or JSON-LD yourself.
Stage 5 writes all of those from the facts, to a length budget, and will
overwrite whatever is there.

---

## The evidence

# Verified facts

These are the ONLY facts you may state outright. Anything absent here is unknown to you.

```json
{
  "name": "Murray Hill Barber Co",
  "category": "barber_shop",
  "address": "1054 Edgewood Ave S, Jacksonville, FL 32205",
  "phone": "(904) 555-0119",
  "google_rating": 4.9,
  "google_review_count": 287,
  "google_maps_url": "https://maps.google.com/?cid=fx-002",
  "opening_hours": [
    "Monday: 9:00 AM – 6:00 PM",
    "Tuesday: 9:00 AM – 6:00 PM",
    "Wednesday: 9:00 AM – 6:00 PM",
    "Thursday: 9:00 AM – 6:00 PM",
    "Friday: 9:00 AM – 7:00 PM",
    "Saturday: 10:00 AM – 4:00 PM",
    "Sunday: Closed"
  ],
  "price_level": null,
  "existing_social_profiles": []
}
```

---

# What customers say (research input only)

review 1. [5 stars, 2 months ago] Been coming here for six years. Best fade in Murray Hill, and the hot towel shave is worth the extra ten minutes. Walk-ins usually get seen inside half an hour.

review 2. [5 stars, a month ago] Took both my boys for back-to-school cuts. They're great with kids and didn't rush. Cash or card, no fuss.

review 3. [5 stars, 3 weeks ago] Beard trim and line up every two weeks. Marcus knows exactly what I want by now. Saturday mornings get busy so come early.

review 4. [4 stars, 5 months ago] Solid straight razor shave and good conversation. Only knocking a star because parking on Edgewood is tight.

review 5. [5 stars, a week ago] Old school shop, new school skills. They do tapers, designs, and my dad's regular trim all in the same chair.

Cite these as 'review 1', 'review 2' and so on when recording evidence. Never reproduce this text on the site.
