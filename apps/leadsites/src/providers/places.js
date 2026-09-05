import { config } from "../config.js";
import { METRO } from "../geo.js";
import { HttpError } from "../http.js";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places";
// Photo names already start with "places/", so they hang off /v1 directly.
const MEDIA_BASE = "https://places.googleapis.com/v1";

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
export async function searchPlaces({ query, location, maxPages = config.places.maxPages, fenced = true }) {
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
    const body = {
      textQuery,
      pageSize: 20,
      languageCode: "en",
      regionCode: "US",
    };
    // Hard fence for prospecting sweeps: nothing outside the metro can come
    // back, whatever the text query gets geocoded to. A lookup by name is the
    // opposite situation - you already know who you want - so it opts out.
    if (fenced) body.locationRestriction = { rectangle: METRO.bounds };
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

/**
 * Fields that carry the content signal: what customers actually say, and how
 * Google itself summarises the place.
 *
 * These sit in the Enterprise + Atmosphere SKU, one tier above the search mask
 * above. That is exactly why they are fetched per place, on demand, for the one
 * business you decided to build for - not for all 60 search results you are
 * about to throw most of away.
 */
const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "reviews",
  "editorialSummary",
  "priceLevel",
  "regularOpeningHours",
  "primaryTypeDisplayName",
  // Same SKU as reviews, so no extra tier cost. Photo *names* are returned to
  // the caller and deliberately never persisted: Google's terms exempt only
  // place_id from the no-caching rule.
  "photos",
].join(",");

const normalizeReview = (review) => ({
  rating: review.rating ?? null,
  text: review.text?.text ?? review.originalText?.text ?? "",
  author: review.authorAttribution?.displayName ?? null,
  when: review.relativePublishTimeDescription ?? null,
  publishedAt: review.publishTime ?? null,
});

/** Place Details for one place. One billed Enterprise + Atmosphere request. */
export async function fetchPlaceDetails(placeId) {
  if (!config.places.apiKey) {
    throw new HttpError(400, "GOOGLE_MAPS_API_KEY is not set", {
      hint: "Reviews come from Google Place Details, which needs a key.",
    });
  }

  const res = await fetch(`${DETAILS_ENDPOINT}/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": config.places.apiKey,
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(res.status === 403 ? 403 : 502, json?.error?.message ?? `Place Details returned ${res.status}`, {
      status: res.status,
      googleStatus: json?.error?.status,
    });
  }

  return {
    reviews: (json.reviews ?? []).map(normalizeReview).filter((r) => r.text),
    photoNames: (json.photos ?? []).map((p) => p.name).filter(Boolean),
    editorialSummary: json.editorialSummary?.text ?? null,
    priceLevel: json.priceLevel ?? null,
    typeDisplayName: json.primaryTypeDisplayName?.text ?? null,
    hours: json.regularOpeningHours?.weekdayDescriptions ?? null,
    billedRequests: 1,
  };
}

/**
 * Fetch one photo's bytes.
 *
 * The caller must treat the result as transient. Google's terms forbid caching
 * photo names or media; this exists so a photo can be looked at once and thrown
 * away, never so it can be stored or served.
 */
export async function fetchPhotoMedia(photoName, { maxWidthPx = 1024 } = {}) {
  if (!config.places.apiKey) throw new HttpError(400, "GOOGLE_MAPS_API_KEY is not set");

  const url = new URL(`${MEDIA_BASE}/${photoName}/media`);
  url.searchParams.set("maxWidthPx", String(maxWidthPx));

  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": config.places.apiKey },
    redirect: "follow",
  });
  if (!res.ok) throw new HttpError(502, `Place Photo returned ${res.status}`);

  const mediaType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, mediaType, billedRequests: 1 };
}
