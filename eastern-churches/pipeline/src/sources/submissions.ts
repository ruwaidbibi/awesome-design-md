import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DATA_DIR } from "../config.js";
import { categorize } from "../extract/categorize.js";
import { eventId } from "../util/slug.js";
import { log } from "../util/log.js";
import type { ChurchEvent } from "../schema.js";

/**
 * Community submissions. The web app's /submit form writes here (or a
 * moderator pastes entries in), and they are treated as the highest-confidence
 * source because a human at the parish typed them.
 *
 * Submissions are only accepted for parishes already in the dataset, and only
 * once `approved` is true, so the form cannot inject arbitrary records.
 */
const Submission = z.object({
  parishId: z.string(),
  title: z.string().min(2),
  start: z.string(),
  end: z.string().optional(),
  allDay: z.boolean().default(false),
  description: z.string().optional(),
  location: z.string().optional(),
  url: z.string().url().optional(),
  submittedBy: z.string().optional(),
  submittedAt: z.string(),
  approved: z.boolean().default(false),
});

export function readSubmittedEvents(knownParishIds: Set<string>): ChurchEvent[] {
  const path = join(DATA_DIR, "submissions.json");
  if (!existsSync(path)) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    log.error("submissions.json is not valid JSON", (err as Error).message);
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const out: ChurchEvent[] = [];
  let rejected = 0;

  for (const item of raw) {
    const parsed = Submission.safeParse(item);
    if (!parsed.success) {
      rejected++;
      continue;
    }
    const s = parsed.data;
    if (!s.approved || !knownParishIds.has(s.parishId) || Number.isNaN(Date.parse(s.start))) {
      rejected++;
      continue;
    }
    out.push({
      id: eventId(s.parishId, s.title, s.start),
      parishId: s.parishId,
      title: s.title,
      description: s.description,
      start: s.start,
      end: s.end,
      allDay: s.allDay,
      location: s.location,
      url: s.url,
      category: categorize(s.title, s.description),
      provenance: {
        source: "submission",
        method: "manual",
        fetchedAt: s.submittedAt,
        confidence: 1,
      },
      cancelled: false,
    });
  }

  if (rejected) log.info(`submissions: ${out.length} accepted, ${rejected} skipped (unapproved, unknown parish, or malformed)`);
  return out;
}
