"use client";

import { useMemo, useState, useDeferredValue } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { TRADITION_COLORS, TRADITION_SHORT, relativeDays } from "@/lib/format";
import type { ParishSummary } from "@/lib/data";
import type { TraditionId } from "@/lib/types";

// MapLibre touches window on import, so it loads only in the browser.
const ChurchMap = dynamic(() => import("./ChurchMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] w-full animate-pulse rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] lg:h-[calc(100vh-13rem)]" />
  ),
});

interface Props {
  parishes: ParishSummary[];
  traditions: { id: TraditionId; name: string; parishes: number }[];
}

type SortKey = "name" | "events" | "state";

export default function DirectoryExplorer({ parishes, traditions }: Props) {
  const [query, setQuery] = useState("");
  const [selectedTraditions, setSelectedTraditions] = useState<Set<TraditionId>>(new Set());
  const [state, setState] = useState("");
  const [withEventsOnly, setWithEventsOnly] = useState(false);
  const [withSocialsOnly, setWithSocialsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [selectedId, setSelectedId] = useState<string>();

  const deferredQuery = useDeferredValue(query);

  const states = useMemo(
    () => [...new Set(parishes.map((p) => p.state).filter(Boolean))].sort() as string[],
    [parishes],
  );

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const result = parishes.filter((p) => {
      if (selectedTraditions.size && !selectedTraditions.has(p.tradition)) return false;
      if (state && p.state !== state) return false;
      if (withEventsOnly && p.eventCount === 0) return false;
      if (withSocialsOnly && p.socialCount === 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.city?.toLowerCase().includes(q) ?? false) ||
        (p.state?.toLowerCase() === q)
      );
    });

    return result.sort((a, b) => {
      if (sort === "events") return b.eventCount - a.eventCount || a.name.localeCompare(b.name);
      if (sort === "state") return (a.state ?? "ZZ").localeCompare(b.state ?? "ZZ") || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [parishes, deferredQuery, selectedTraditions, state, withEventsOnly, withSocialsOnly, sort]);

  const toggleTradition = (id: TraditionId) =>
    setSelectedTraditions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hasFilters =
    Boolean(query || state || withEventsOnly || withSocialsOnly) || selectedTraditions.size > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {traditions.map((t) => {
          const active = selectedTraditions.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTradition(t.id)}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-transparent bg-[var(--color-ink)] text-[var(--color-page)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-ink-faint)]"
              }`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: TRADITION_COLORS[t.id] }}
              />
              {t.name}
              <span className="text-xs text-[var(--color-ink-faint)]">{t.parishes}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search parish, city, or state"
          className="min-w-56 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          aria-label="Filter by state"
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        >
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort by"
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        >
          <option value="name">Sort: name</option>
          <option value="events">Sort: most events</option>
          <option value="state">Sort: state</option>
        </select>
        <Toggle checked={withEventsOnly} onChange={setWithEventsOnly} label="Has events" />
        <Toggle checked={withSocialsOnly} onChange={setWithSocialsOnly} label="Has socials" />
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setState("");
              setWithEventsOnly(false);
              setWithSocialsOnly(false);
              setSelectedTraditions(new Set());
            }}
            className="text-sm text-[var(--color-accent)] underline"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-[var(--color-ink-soft)]">
        {filtered.length.toLocaleString()} of {parishes.length.toLocaleString()} parishes
        {filtered.length > 0 && (
          <> · {filtered.filter((p) => p.lat !== undefined).length.toLocaleString()} mapped</>
        )}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-13rem)]">
          {filtered.length === 0 && (
            <li className="rounded-lg border border-dashed border-[var(--color-line)] p-6 text-center text-sm text-[var(--color-ink-faint)]">
              Nothing matches those filters.
            </li>
          )}
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/church/${p.id}`}
                onMouseEnter={() => setSelectedId(p.id)}
                onFocus={() => setSelectedId(p.id)}
                className={`block rounded-lg border bg-[var(--color-surface)] p-3 transition-colors ${
                  selectedId === p.id
                    ? "border-[var(--color-accent)]"
                    : "border-[var(--color-line)] hover:border-[var(--color-ink-faint)]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: TRADITION_COLORS[p.tradition] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                      {TRADITION_SHORT[p.tradition]}
                      {p.city && ` · ${p.city}, ${p.state}`}
                      {p.status !== "parish" && p.status !== "unknown" && ` · ${p.status}`}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                      {p.socialCount > 0 && <Pill>{p.socialCount} social</Pill>}
                      {p.eventCount > 0 && (
                        <Pill accent>
                          {p.eventCount} event{p.eventCount === 1 ? "" : "s"}
                          {p.nextEvent && ` · next ${relativeDays(p.nextEvent)}`}
                        </Pill>
                      )}
                      {p.lat === undefined && <Pill>unmapped</Pill>}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <ChurchMap parishes={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>
    </div>
  );
}

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 ${
        accent
          ? "bg-[var(--color-accent)]/12 text-[var(--color-accent)]"
          : "bg-[var(--color-ink)]/6"
      }`}
    >
      {children}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={`cursor-pointer select-none rounded-md border px-3 py-2 text-sm transition-colors ${
        checked
          ? "border-transparent bg-[var(--color-ink)] text-[var(--color-page)]"
          : "border-[var(--color-line)] bg-[var(--color-surface)]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      {label}
    </label>
  );
}
