/**
 * Google's Places policy allows caching most place content for up to 30 days
 * (place IDs may be stored indefinitely). Kept separate from the store so the
 * rule is testable on its own and obvious to find.
 */
export const DETAILS_TTL_DAYS = 30;

export function detailsAge(fetchedAt) {
  if (!fetchedAt) return null;
  const ms = Date.now() - new Date(fetchedAt).getTime();
  return Number.isFinite(ms) ? ms / 86_400_000 : null;
}

export function detailsAreStale(fetchedAt) {
  const age = detailsAge(fetchedAt);
  return age == null || age > DETAILS_TTL_DAYS;
}
