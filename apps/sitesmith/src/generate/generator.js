import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config, hasGenKey } from "../config.js";
import { createSite, getSite, listSites, updateSite } from "../db.js";
import { HttpError } from "../http.js";
import { contentContext } from "../pipeline/content.js";
import { readDesign } from "./designs.js";

let client = null;
const getClient = () => (client ??= new Anthropic());

const SYSTEM = `You build small, complete marketing websites for local businesses.

You are given (a) a DESIGN.md describing a design system and (b) verified facts about one real business. You return one self-contained HTML document.

## Truthfulness (this is the hard constraint)

This site represents a REAL business to REAL customers. Every factual claim must trace back to the facts you were given.

NEVER invent: testimonials or review quotes, customer names, staff names or bios, awards, certifications, licences, "family owned since 1974", years in business, employee counts, prices, service guarantees, email addresses, second locations, or delivery/booking partners.

You MAY state the rating and review count exactly as supplied (e.g. "4.7 stars across 412 Google reviews"), the address, the phone number, and the opening hours, because those are supplied and verified.

## Using the reviews

When customer reviews are supplied, they are evidence of what this business actually does and what it is actually good at. Use them to decide what the site should say:

- A service named across several reviews (a beard trim, gel manicures, catering, weekend tamales) is real - feature it.
- A detail mentioned once is weak evidence. You may reflect it quietly; never headline it.
- Recurring praise tells you the tone and the selling point. Write to it.
- Where reviews and the structured facts disagree, the structured facts win.

Three hard limits on reviews:

1. NEVER reproduce review text verbatim or near-verbatim, and never put it on the page as a quote or a testimonial. The reviews are research input, not copy. Write original sentences in the business's own voice.
2. NEVER name, quote, or allude to an individual reviewer.
3. NEVER repeat a complaint, and never write defensively about one.

Operator notes, when supplied, are verified fact from the person running this tool. Treat them exactly like the structured facts.

Where a section would normally carry information you do not have, do ONE of:
  1. omit the section entirely, or
  2. write a placeholder the owner can fill in, marked exactly like this:
     <span class="sitesmith-todo">[[ADD: two sentences on your story]]</span>
Describe services only in the general terms implied by the business category, never as a specific priced offer.

## Output

- Exactly one HTML document, starting with <!DOCTYPE html>. No markdown fences, no commentary before or after.
- Fully self-contained: all CSS in one <style> block, any JS in one <script> block. No build step, no external CSS/JS/font/image requests of any kind, because this file is served as a single static asset.
- No <img src> pointing anywhere external. Use CSS gradients, CSS shapes, or inline SVG for visual interest, and leave clearly marked photo slots the owner can replace:
  <div class="sitesmith-photo">[[ADD PHOTO: storefront]]</div>
- Give .sitesmith-todo and .sitesmith-photo a visible dashed outline so unfinished spots are obvious in review.
- Responsive from 360px to 1440px. Semantic landmarks, real heading order, labelled controls, visible focus styles, and text that meets WCAG AA contrast against its background.
- Include a phone link (<a href="tel:...">) and a Google Maps link wherever a customer would reasonably want one.
- A contact form is fine only if it has no backend to submit to: use a mailto: or tel: call to action instead, or a form clearly marked with a placeholder action.

## Design fidelity

Follow the DESIGN.md as a real design system: use its colour tokens, type scale, spacing, radii, and component patterns. Adapt them to this business's category and tone. Do not copy the source brand's name, logo, wordmark, product names, or marketing copy into the site, and do not imply any affiliation with it. You are borrowing the visual language only.`;

function buildUserPrompt({ business, design, previousHtml, feedback }) {
  const content = contentContext(business);
  const socials = content.socials;
  const facts = {
    name: business.name,
    category: business.primary_type,
    address: business.address,
    phone: business.phone,
    google_rating: business.rating,
    google_review_count: business.review_count,
    google_maps_url: business.google_maps_uri,
    opening_hours: JSON.parse(business.hours_json ?? "null"),
    existing_social_profiles: socials.map((s) => ({ platform: s.platform, url: s.url })),
    why_they_need_this: business.website_reason,
  };

  const blocks = [
    "# DESIGN.md to follow\n\n" + design.markdown,
    "# Verified facts about the business\n\nThese are the ONLY facts you may state. Anything absent here is unknown to you.\n\n```json\n" +
      JSON.stringify(facts, null, 2) +
      "\n```",
  ];

  if (content.editorialSummary) {
    blocks.push("# How Google summarises this place\n\n" + content.editorialSummary);
  }

  if (content.reviews.length > 0) {
    blocks.push(
      "# What customers say (research input only - never quote or paraphrase closely)\n\n" +
        content.reviews
          .map((r, i) => `${i + 1}. [${r.rating ?? "?"} stars, ${r.when ?? "undated"}] ${r.text}`)
          .join("\n\n") +
        "\n\nUse these to decide which services and qualities the site features. Do not reproduce any of this text.",
    );
  } else {
    blocks.push(
      "# What customers say\n\nNo review text is available for this business. Describe services only in the general terms its category implies, and lean on placeholders rather than guessing at specifics.",
    );
  }

  if (content.ownerNotes) {
    blocks.push("# Operator notes (verified - treat as fact)\n\n" + content.ownerNotes);
  }

  if (previousHtml && feedback) {
    blocks.push(
      "# The previous version of this site\n\n```html\n" + previousHtml + "\n```",
      "# Requested changes\n\nRevise the site above to address this feedback. Keep everything that was not mentioned.\n\n" +
        feedback,
    );
  }

  blocks.push(
    previousHtml && feedback
      ? "Return the complete revised HTML document."
      : `Build the website for ${business.name}. Return the complete HTML document.`,
  );

  return blocks.join("\n\n---\n\n");
}

/** Pull the HTML document out of the model's reply, tolerating stray fences. */
export function extractHtml(raw) {
  let text = raw.trim();
  const fence = /```(?:html)?\s*\n([\s\S]*?)\n```/i.exec(text);
  if (fence) text = fence[1].trim();
  const start = text.search(/<!DOCTYPE html|<html[\s>]/i);
  if (start > 0) text = text.slice(start);
  const end = text.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) text = text.slice(0, end + "</html>".length);
  return text.trim();
}

const sitePath = (site) => path.join(config.sitesDir, `${site.business_id}-v${site.version}.html`);

/**
 * Generate a site for one business.
 *
 * Streams so long generations cannot hit an HTTP timeout, and so the UI has
 * something to show. `onEvent` receives {type: "thinking"|"delta"|"usage", ...}.
 */
export async function generateSite({ business, designKey, feedback = null, previousSiteId = null }, onEvent = () => {}) {
  if (!hasGenKey()) {
    throw new HttpError(400, "ANTHROPIC_API_KEY is not set", {
      hint: "Add it to apps/sitesmith/.env. Prospecting works without it; generation does not.",
    });
  }

  const design = readDesign(designKey);

  // A revision needs the page it is revising: the caller's choice, else the
  // most recent version that actually produced a file.
  let previousHtml = null;
  if (feedback) {
    const prior = previousSiteId
      ? getSite(previousSiteId)
      : listSites(business.id).find((s) => s.html_path && s.status !== "failed");
    if (prior?.html_path && fs.existsSync(prior.html_path)) {
      previousHtml = fs.readFileSync(prior.html_path, "utf8");
    } else {
      onEvent({ type: "note", message: "No previous version on disk; generating from scratch." });
    }
  }

  const site = createSite({
    businessId: business.id,
    designKey,
    model: config.gen.model,
    feedback,
  });
  onEvent({ type: "start", siteId: site.id, version: site.version, design: designKey, model: config.gen.model });

  const request = {
    model: config.gen.model,
    max_tokens: 64000,
    system: SYSTEM,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: config.gen.effort },
    messages: [{ role: "user", content: buildUserPrompt({ business, design, previousHtml, feedback }) }],
  };

  try {
    let message;
    try {
      message = await streamOnce(getClient(), {
        ...request,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      }, onEvent);
    } catch (err) {
      // Older API surfaces reject the fallback params; the request itself is fine.
      if (err?.status === 400) {
        onEvent({ type: "note", message: "Server-side fallbacks unavailable; retrying without them." });
        message = await streamOnce(getClient(), request, onEvent);
      } else {
        throw err;
      }
    }

    if (message.stop_reason === "refusal") {
      throw new HttpError(422, "The model declined this generation", {
        category: message.stop_details?.category ?? null,
        explanation: message.stop_details?.explanation ?? null,
      });
    }

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const html = extractHtml(raw);

    if (!/<html[\s>]/i.test(html)) {
      throw new HttpError(502, "Model did not return an HTML document", { preview: raw.slice(0, 400) });
    }

    const file = sitePath(site);
    fs.writeFileSync(file, html, "utf8");

    updateSite(site.id, {
      html_path: file,
      bytes: Buffer.byteLength(html),
      input_tokens: message.usage?.input_tokens ?? null,
      output_tokens: message.usage?.output_tokens ?? null,
      status: message.stop_reason === "max_tokens" ? "truncated" : "ready",
      error: message.stop_reason === "max_tokens" ? "Hit the output token cap; the page may be cut off." : null,
    });

    const finished = getSite(site.id);
    onEvent({ type: "done", site: finished });
    return finished;
  } catch (err) {
    updateSite(site.id, { status: "failed", error: err.message?.slice(0, 500) ?? "Unknown error" });
    onEvent({ type: "error", message: err.message, detail: err.detail ?? null });
    throw err;
  }
}

async function streamOnce(anthropic, params, onEvent) {
  const stream = params.betas
    ? anthropic.beta.messages.stream(params)
    : anthropic.messages.stream(params);

  let bytes = 0;
  stream.on("streamEvent", (event) => {
    if (event.type !== "content_block_delta") return;
    if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
      onEvent({ type: "thinking", text: event.delta.thinking });
    } else if (event.delta?.type === "text_delta") {
      bytes += event.delta.text.length;
      onEvent({ type: "delta", bytes, text: event.delta.text });
    }
  });

  return stream.finalMessage();
}
