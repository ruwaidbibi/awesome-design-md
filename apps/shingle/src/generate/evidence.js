import { contentContext } from "../pipeline/content.js";

/**
 * Assemble everything the model is allowed to reason about, as labelled blocks.
 *
 * Shared by the planner and the renderer so both see exactly the same evidence,
 * and so "where did that sentence come from" has one answer.
 */
export function buildEvidence(business) {
  const content = contentContext(business);
  const vision = JSON.parse(business.vision_json ?? "null");

  const facts = {
    name: business.name,
    category: business.primary_type,
    address: business.address,
    phone: business.phone,
    google_rating: business.rating,
    google_review_count: business.review_count,
    google_maps_url: business.google_maps_uri,
    opening_hours: JSON.parse(business.hours_json ?? "null"),
    price_level: content.priceLevel,
    existing_social_profiles: content.socials.map((s) => ({ platform: s.platform, url: s.url })),
  };

  const blocks = [];

  blocks.push({
    label: "facts",
    text:
      "# Verified facts\n\nThese are the ONLY facts you may state outright. Anything absent here is unknown to you.\n\n```json\n" +
      JSON.stringify(facts, null, 2) +
      "\n```",
  });

  if (content.editorialSummary) {
    blocks.push({ label: "editorial", text: "# How Google summarises this place\n\n" + content.editorialSummary });
  }

  if (content.reviews.length > 0) {
    blocks.push({
      label: "reviews",
      text:
        "# What customers say (research input only)\n\n" +
        content.reviews
          .map((r, i) => `review ${i + 1}. [${r.rating ?? "?"} stars, ${r.when ?? "undated"}] ${r.text}`)
          .join("\n\n") +
        "\n\nCite these as 'review 1', 'review 2' and so on when recording evidence. Never reproduce this text on the site.",
    });
  } else {
    blocks.push({
      label: "reviews",
      text:
        "# What customers say\n\nNo review text is available. You have no evidence about specific services, so do not name any: describe the business only in the general terms its category implies, and prefer placeholders over guesses.",
    });
  }

  if (vision?.usable) {
    blocks.push({
      label: "photos",
      text:
        "# What their photos show\n\nDerived from customer photos of the place. The photos themselves are not available to the site and must never be described as if the site displays them.\n\n" +
        `Scene: ${vision.scene}\n` +
        (vision.signals?.length ? `Signals: ${vision.signals.join(", ")}\n` : "") +
        (vision.palette?.length
          ? `Colours actually present (estimated by eye, not measured): ${vision.palette.map((c) => `${c.hex} on ${c.where}`).join("; ")}\n`
          : "") +
        "\nCite these as 'photo' when recording evidence.",
    });
  }

  if (content.ownerNotes) {
    blocks.push({
      label: "notes",
      text:
        "# Operator notes (verified - treat exactly like the facts above)\n\n" +
        content.ownerNotes +
        "\n\nCite these as 'operator notes' when recording evidence.",
    });
  }

  return { blocks, content, vision, facts };
}

export const evidenceText = (evidence) => evidence.blocks.map((b) => b.text).join("\n\n---\n\n");

/** Rules that hold for the planner and the renderer alike. */
export const TRUTH_RULES = `## Truthfulness (the hard constraint)

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
3. NEVER repeat a complaint, and never write defensively about one.`;
