import { getBusiness, now, updateBusiness } from "../db.js";
import { getProvider } from "../providers/index.js";
import { detailsAge, detailsAreStale, DETAILS_TTL_DAYS } from "./freshness.js";

export { DETAILS_TTL_DAYS, detailsAge, detailsAreStale };



/**
 * Pull reviews and Google's editorial summary for one business.
 *
 * This is a separate, on-demand call for a reason: reviews put a Places request
 * in the Enterprise + Atmosphere SKU, one tier above the search. Fetching them
 * only for a business you have already decided to build for keeps the expensive
 * tier off the ~80% of search results you discard.
 */
export async function fetchDetails(businessId, { force = false } = {}) {
  const business = getBusiness(businessId);
  if (!business) throw new Error(`No such business: ${businessId}`);

  if (!force && !detailsAreStale(business.details_fetched_at)) {
    return { business, billedRequests: 0, cached: true };
  }

  const provider = getProvider();
  const details = await provider.fetchPlaceDetails(business.id);

  updateBusiness(businessId, {
    reviews_json: JSON.stringify(details.reviews ?? []),
    editorial_summary: details.editorialSummary ?? null,
    price_level: details.priceLevel ?? null,
    details_fetched_at: now(),
    hours_json: details.hours ? JSON.stringify(details.hours) : business.hours_json,
  });

  return { business: getBusiness(businessId), billedRequests: details.billedRequests ?? 1, cached: false };
}

/**
 * Everything the generator is allowed to reason about, and nothing else.
 * Returns `usable: false` when the review data is missing or out of policy, so
 * the caller can generate from facts alone rather than from stale text.
 */
export function contentContext(business) {
  const stale = detailsAreStale(business.details_fetched_at);
  const stored = JSON.parse(business.reviews_json ?? "[]");
  // Stored but out of policy: still counted, deliberately not handed onward.
  const reviews = stale ? [] : stored;
  const socials = JSON.parse(business.socials_json ?? "{}")?.socials ?? [];

  return {
    usable: reviews.length > 0,
    stale,
    storedCount: stored.length,
    fetchedAt: business.details_fetched_at ?? null,
    ageDays: detailsAge(business.details_fetched_at),
    reviews,
    editorialSummary: stale ? null : business.editorial_summary,
    priceLevel: stale ? null : business.price_level,
    socials,
    ownerNotes: business.notes || null,
  };
}
