import ical from "node-ical";
import type { ChurchEvent, Provenance } from "../schema.js";
import { eventId } from "../util/slug.js";
import { categorize } from "./categorize.js";
import { log } from "../util/log.js";

/**
 * iCal is the highest-quality event source available: real start/end times,
 * timezones, recurrence, and cancellations, with no guessing. Parishes on
 * Squarespace, Wix, Realm, Breeze and most WordPress calendar plugins expose
 * one, which is why the socials step records every .ics it finds.
 */
export function parseIcal(
  body: string,
  parishId: string,
  provenance: Provenance,
  horizonDays = 180,
): ChurchEvent[] {
  let parsed: ical.CalendarResponse;
  try {
    parsed = ical.sync.parseICS(body);
  } catch (err) {
    log.warn(`ical parse failed for ${parishId}`, (err as Error).message);
    return [];
  }

  const now = Date.now();
  const horizon = now + horizonDays * 864e5;
  const out: ChurchEvent[] = [];

  for (const value of Object.values(parsed)) {
    if (!value || value.type !== "VEVENT") continue;
    const ev = value as ical.VEvent;
    if (!ev.start || !ev.summary) continue;

    // Expand recurrence within the horizon so the UI never has to run an
    // RRULE engine of its own.
    const starts: Date[] = [];
    const rrule = (ev as unknown as { rrule?: { between(a: Date, b: Date, inc: boolean): Date[] } }).rrule;
    if (rrule) {
      try {
        starts.push(...rrule.between(new Date(now - 864e5), new Date(horizon), true).slice(0, 60));
      } catch {
        starts.push(ev.start);
      }
    } else {
      starts.push(ev.start);
    }

    const durationMs = ev.end && ev.start ? ev.end.getTime() - ev.start.getTime() : 0;
    const allDay = (ev.datetype as string | undefined) === "date";

    for (const start of starts) {
      const t = start.getTime();
      if (t < now - 864e5 || t > horizon) continue;
      const startIso = allDay ? start.toISOString().slice(0, 10) : start.toISOString();
      const title = String(ev.summary).trim();

      out.push({
        id: eventId(parishId, title, startIso),
        parishId,
        title,
        description: ev.description ? String(ev.description).trim().slice(0, 2000) : undefined,
        start: startIso,
        end: durationMs > 0 ? new Date(t + durationMs).toISOString() : undefined,
        allDay,
        timezone: (ev.start as unknown as { tz?: string }).tz,
        location: ev.location ? String(ev.location).trim() : undefined,
        url: typeof ev.url === "string" && /^https?:/.test(ev.url) ? ev.url : undefined,
        category: categorize(title, ev.description ? String(ev.description) : undefined),
        recurrence: rrule ? String((ev as unknown as { rrule: { toString(): string } }).rrule) : undefined,
        provenance,
        cancelled: String(ev.status ?? "").toUpperCase() === "CANCELLED",
      });
    }
  }
  return out;
}
