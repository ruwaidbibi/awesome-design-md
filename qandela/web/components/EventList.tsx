import Link from "next/link";
import { CATEGORY_LABELS, formatEventDate, relativeDays } from "@/lib/format";
import type { ChurchEvent } from "@/lib/types";

interface Props {
  events: ChurchEvent[];
  /** Parish id -> display name, when the list spans multiple parishes. */
  parishNames?: Map<string, string>;
  empty?: string;
}

export default function EventList({ events, parishNames, empty }: Props) {
  if (!events.length) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-line)] p-6 text-center text-sm text-[var(--color-ink-faint)]">
        {empty ?? "No upcoming events found."}
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li
          key={e.id}
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-medium tabular-nums text-[var(--color-accent)]">
              {formatEventDate(e.start, e.allDay)}
            </span>
            <span className="text-xs text-[var(--color-ink-faint)]">{relativeDays(e.start)}</span>
            <span className="rounded bg-[var(--color-ink)]/6 px-1.5 py-0.5 text-[11px] text-[var(--color-ink-soft)]">
              {CATEGORY_LABELS[e.category] ?? e.category}
            </span>
          </div>

          <p className="mt-1 font-medium">
            {e.url ? (
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="hover:text-[var(--color-accent)] hover:underline"
              >
                {e.title}
              </a>
            ) : (
              e.title
            )}
          </p>

          {parishNames?.get(e.parishId) && (
            <Link
              href={`/church/${e.parishId}`}
              className="mt-0.5 inline-block text-sm text-[var(--color-ink-soft)] hover:underline"
            >
              {parishNames.get(e.parishId)}
            </Link>
          )}

          {e.description && (
            <p className="mt-1.5 line-clamp-3 text-sm text-[var(--color-ink-soft)]">{e.description}</p>
          )}

          <p className="mt-1.5 text-[11px] text-[var(--color-ink-faint)]">
            {e.location && <>{e.location} · </>}
            source: {e.provenance.method}
            {e.provenance.url && (
              <>
                {" · "}
                <a
                  href={e.provenance.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline"
                >
                  origin
                </a>
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
