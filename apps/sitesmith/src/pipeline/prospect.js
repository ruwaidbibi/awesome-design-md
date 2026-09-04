import {
  createSearch,
  finishSearch,
  getBusiness,
  listBusinesses,
  now,
  updateBusiness,
  upsertBusiness,
} from "../db.js";
import { getProvider } from "../providers/index.js";
import { LEAD_STATUSES, scoreBusiness } from "./classify.js";
import { discoverSocials, validateWebsite } from "./validate.js";

/** Run `worker` over `items` with at most `limit` in flight. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Validate one stored business and rescore it. Safe to call repeatedly. */
export async function enrichBusiness(id) {
  const business = getBusiness(id);
  if (!business) throw new Error(`No such business: ${id}`);

  const website = await validateWebsite(business.website_uri);
  const withStatus = { ...business, website_status: website.status };

  const { socials, notes } = await discoverSocials(withStatus);
  const { score, breakdown } = scoreBusiness(withStatus, { socials });

  updateBusiness(id, {
    website_status: website.status,
    website_reason: website.reason,
    website_http_status: website.http_status,
    website_final_url: website.final_url,
    website_checked_at: website.checked_at,
    socials_json: JSON.stringify({ socials, notes }),
    socials_checked_at: now(),
    score,
    score_breakdown: JSON.stringify(breakdown),
  });

  return getBusiness(id);
}

/**
 * The full prospecting run: search, drop anything under the review threshold,
 * then validate and score what is left.
 *
 * `onProgress` receives {phase, ...} events so the UI can stream the run.
 */
export async function runProspect(
  { query, location, minReviews = 200, includeLiveSites = false, concurrency = 6 },
  onProgress = () => {},
) {
  const provider = getProvider();
  const searchId = createSearch({ query, location, minReviews, provider: provider.name });

  onProgress({ phase: "searching", provider: provider.name, query, location });

  const { places, pages, requestCount } = await provider.searchPlaces({ query, location });
  onProgress({ phase: "searched", found: places.length, pages, billedRequests: requestCount });

  const overThreshold = places.filter((p) => (p.review_count ?? 0) >= minReviews);
  onProgress({
    phase: "filtered",
    kept: overThreshold.length,
    dropped: places.length - overThreshold.length,
    minReviews,
  });

  const timestamp = now();
  for (const place of overThreshold) {
    upsertBusiness({ ...place, search_id: searchId, created_at: timestamp, updated_at: timestamp });
  }

  let done = 0;
  await mapLimit(overThreshold, concurrency, async (place) => {
    try {
      const enriched = await enrichBusiness(place.id);
      done += 1;
      onProgress({
        phase: "validated",
        done,
        total: overThreshold.length,
        id: place.id,
        name: place.name,
        websiteStatus: enriched.website_status,
        reason: enriched.website_reason,
      });
    } catch (err) {
      done += 1;
      onProgress({ phase: "validated", done, total: overThreshold.length, id: place.id, name: place.name, error: err.message });
    }
  });

  const rows = listBusinesses({ searchId, limit: 500 }).filter(
    (b) => includeLiveSites || LEAD_STATUSES.has(b.website_status),
  );

  finishSearch(searchId, {
    pagesFetched: pages,
    rawCount: places.length,
    keptCount: rows.length,
  });

  onProgress({ phase: "done", searchId, leads: rows.length });
  return { searchId, provider: provider.name, scanned: places.length, leads: rows };
}
