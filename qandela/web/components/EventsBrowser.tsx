"use client";

import { useMemo, useState } from "react";
import EventList from "./EventList";
import { CATEGORY_LABELS, TRADITION_SHORT } from "@/lib/format";
import type { ChurchEvent, TraditionId } from "@/lib/types";

interface ParishInfo {
  name: string;
  tradition: TraditionId;
  state: string;
}

interface Props {
  events: ChurchEvent[];
  parishInfo: Record<string, ParishInfo>;
}

const WINDOWS = [
  { label: "Next 7 days", days: 7 },
  { label: "Next 30 days", days: 30 },
  { label: "Next 90 days", days: 90 },
  { label: "All", days: 3650 },
];

export default function EventsBrowser({ events, parishInfo }: Props) {
  const [tradition, setTradition] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");
  const [days, setDays] = useState(30);
  const [query, setQuery] = useState("");

  const states = useMemo(
    () => [...new Set(Object.values(parishInfo).map((p) => p.state).filter(Boolean))].sort(),
    [parishInfo],
  );
  const traditions = useMemo(
    () => [...new Set(Object.values(parishInfo).map((p) => p.tradition))].sort(),
    [parishInfo],
  );
  const categories = useMemo(
    () => [...new Set(events.map((e) => e.category))].sort(),
    [events],
  );

  const filtered = useMemo(() => {
    const cutoff = Date.now() + days * 864e5;
    const q = query.trim().toLowerCase();

    return events.filter((e) => {
      if (Date.parse(e.start) > cutoff) return false;
      if (category && e.category !== category) return false;
      const info = parishInfo[e.parishId];
      if (tradition && info?.tradition !== tradition) return false;
      if (state && info?.state !== state) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (info?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [events, parishInfo, days, category, tradition, state, query]);

  const names = useMemo(
    () => new Map(Object.entries(parishInfo).map(([id, info]) => [id, info.name])),
    [parishInfo],
  );

  const selectClass =
    "rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events or parishes"
          className={`min-w-56 flex-1 ${selectClass} outline-none focus:border-[var(--color-accent)]`}
        />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time window" className={selectClass}>
          {WINDOWS.map((w) => (
            <option key={w.days} value={w.days}>{w.label}</option>
          ))}
        </select>
        <select value={tradition} onChange={(e) => setTradition(e.target.value)} aria-label="Tradition" className={selectClass}>
          <option value="">All traditions</option>
          {traditions.map((t) => (
            <option key={t} value={t}>{TRADITION_SHORT[t] ?? t}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={selectClass}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
          ))}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State" className={selectClass}>
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-[var(--color-ink-soft)]">
        {filtered.length.toLocaleString()} event{filtered.length === 1 ? "" : "s"} across{" "}
        {new Set(filtered.map((e) => e.parishId)).size.toLocaleString()} parishes
      </p>

      <EventList events={filtered.slice(0, 300)} parishNames={names} />
      {filtered.length > 300 && (
        <p className="text-center text-sm text-[var(--color-ink-faint)]">
          Showing the first 300. Narrow the filters to see the rest.
        </p>
      )}
    </div>
  );
}
