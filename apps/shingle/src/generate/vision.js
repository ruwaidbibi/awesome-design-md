import { config } from "../config.js";
import { HttpError } from "../http.js";
import { getProvider } from "../providers/index.js";
import { genConfig, send, textOf } from "./client.js";

const SYSTEM = `You look at customer photographs of a local business and report only what is actually visible.

You are not writing marketing copy and you are not guessing. Another system will use your description to write a website, so a confident wrong detail becomes a lie on a real business's homepage.

Report:
- scene: two or three sentences on what the place physically looks like. Storefront, interior, counter, seating, signage, what is being sold or worked on. Describe only what you can see.
- signals: short concrete phrases a copywriter could use, e.g. "hand-painted sign", "counter service", "outdoor seating", "framed certificates on the wall", "vintage barber chairs". Only what is visible. No inferences about quality, price, or history.
- palette: the dominant colours actually present in the building, signage, and fittings, as hex codes. Ignore sky, asphalt, and passing cars. These are your estimate by eye, not a measurement.
- readable: false if the photos are too dark, too cropped, or too generic to say anything useful. Say so rather than padding.

Never name people. Never read a menu, price, or phone number out of a photo and report it as fact - text in photographs is frequently stale or misread.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scene", "signals", "palette", "readable"],
  properties: {
    scene: { type: "string" },
    signals: { type: "array", items: { type: "string" } },
    palette: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hex", "where"],
        properties: {
          hex: { type: "string", description: "#rrggbb" },
          where: { type: "string", description: "What is this colour on?" },
        },
      },
    },
    readable: { type: "boolean" },
    notes: { type: "string" },
  },
};

/**
 * Look at a business's photos once, keep what was learned, throw the photos away.
 *
 * Google's terms exempt only place_id from their no-caching rule, so photo names
 * and bytes are never written to disk or the database. What persists is our own
 * derived description - which is also the only thing the site can honestly use,
 * since it cannot display the photos either.
 *
 * Sending photos to a model for analysis is a use Google's terms do not
 * obviously contemplate, so this is off unless PHOTO_VISION=true.
 */
export async function analyzePhotos(business, onEvent = () => {}) {
  if (!config.gen.photoVision) {
    throw new HttpError(400, "Photo analysis is off", {
      hint: "Set PHOTO_VISION=true in .env to enable it, after reading the licensing note in the README.",
    });
  }

  const provider = getProvider();
  if (typeof provider.fetchPhotoMedia !== "function") {
    throw new HttpError(400, `The ${provider.name} provider has no photos`);
  }

  // Re-fetched every time rather than stored, deliberately.
  const details = await provider.fetchPlaceDetails(business.id);
  const names = (details.photoNames ?? []).slice(0, config.gen.photoVisionMax);
  let billedRequests = details.billedRequests ?? 0;

  if (names.length === 0) {
    return { vision: { usable: false, reason: "Google has no photos for this business" }, billedRequests };
  }

  onEvent({ type: "note", message: `reading ${names.length} photo(s)` });

  const images = [];
  for (const name of names) {
    try {
      const { bytes, mediaType, billedRequests: n } = await provider.fetchPhotoMedia(name);
      billedRequests += n ?? 1;
      images.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: bytes.toString("base64") },
      });
    } catch (err) {
      onEvent({ type: "note", message: `skipped a photo: ${err.message}` });
    }
  }

  if (images.length === 0) {
    return { vision: { usable: false, reason: "None of the photos could be loaded" }, billedRequests };
  }

  const message = await send(
    {
      model: genConfig().model,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            ...images,
            { type: "text", text: `These are customer photos of ${business.name}, a ${business.primary_type?.replace(/_/g, " ") ?? "local business"} at ${business.address}. Report what is visible.` },
          ],
        },
      ],
    },
    onEvent,
  );

  let raw;
  try {
    raw = JSON.parse(textOf(message));
  } catch (err) {
    throw new HttpError(502, "Photo analysis did not return usable JSON", { detail: err.message });
  }

  const vision = {
    usable: Boolean(raw.readable) && Boolean(raw.scene),
    scene: raw.scene ?? null,
    signals: raw.signals ?? [],
    palette: (raw.palette ?? []).filter((p) => /^#[0-9a-f]{6}$/i.test(p.hex ?? "")),
    notes: raw.notes ?? null,
    photosRead: images.length,
    analyzedAt: new Date().toISOString(),
    // Deliberately absent: photo names, photo URLs, photo bytes.
  };

  return { vision, billedRequests };
}
