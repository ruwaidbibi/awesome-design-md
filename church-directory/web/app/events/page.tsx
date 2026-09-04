import { getDataset, getUpcomingEvents } from "@/lib/data";
import EventsBrowser from "@/components/EventsBrowser";

export const metadata = { title: "Upcoming events" };

export default function EventsPage() {
  const events = getUpcomingEvents();
  const { parishes } = getDataset();

  const parishInfo = Object.fromEntries(
    parishes.map((p) => [
      p.id,
      { name: p.name, tradition: p.tradition, state: p.address?.state ?? "" },
    ]),
  );

  return (
    <div className="space-y-5">
      <div className="max-w-2xl">
        <h1 className="serif text-2xl font-semibold tracking-tight">Upcoming events</h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
          Everything the pipeline found on parish calendars, iCal feeds and structured event
          markup. Parishes that publish only to Facebook will be thin here until their Page grants
          the Meta app access.
        </p>
      </div>
      <EventsBrowser events={events} parishInfo={parishInfo} />
    </div>
  );
}
