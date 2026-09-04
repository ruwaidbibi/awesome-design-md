import { config } from "../config.js";
import { HttpError } from "../http.js";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

// Every field here is billed. websiteUri and userRatingCount are what put this
// request on the Enterprise SKU, and they are exactly the two the whole app is
// about, so there is nothing to trim. Everything else is Essentials/Pro.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryType",
  "places.types",
  "places.regularOpeningHours",
  "nextPageToken",
].join(",");

/** A Places `place` object -> the shape the rest of the app speaks. */
export function normalizePlace(place) {
  return {
    id: place.id,
    name: place.displayName?.text ?? "(unnamed)",
    address: place.formattedAddress ?? null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    phone: place.nationalPhoneNumber ?? null,
    rating: place.rating ?? null,
    review_count: place.userRatingCount ?? 0,
    website_uri: place.websiteUri ?? null,
    google_maps_uri: place.googleMapsUri ?? null,
    primary_type: place.primaryType ?? null,
    types_json: JSON.stringify(place.types ?? []),
    business_status: place.businessStatus ?? null,
    hours_json: place.regularOpeningHours?.weekdayDescriptions
      ? JSON.stringify(place.regularOpeningHours.weekdayDescriptions)
      : null,
  };
}

/**
 * Text Search (New), paginated. Google caps a text search at 20 results per
 * page and 3 pages, so 60 places is the hard ceiling for one query.
 */
export async function searchPlaces({ query, location, maxPages = config.places.maxPages }) {
  if (!config.places.apiKey) {
    throw new HttpError(400, "GOOGLE_MAPS_API_KEY is not set", {
      hint: "Set it in .env, or set PLACES_PROVIDER=fixtures to explore with sample data.",
    });
  }

  const textQuery = location ? `${query} in ${location}` : query;
  const places = [];
  let pageToken;
  let pages = 0;

  do {
    const body = { textQuery, pageSize: 20, languageCode: "en" };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": config.places.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = json?.error?.message ?? `Places API returned ${res.status}`;
      throw new HttpError(res.status === 403 ? 403 : 502, message, {
        status: res.status,
        googleStatus: json?.error?.status,
      });
    }

    places.push(...(json.places ?? []));
    pageToken = json.nextPageToken;
    pages += 1;
  } while (pageToken && pages < maxPages);

  return { places: places.map(normalizePlace), pages, requestCount: pages };
}
