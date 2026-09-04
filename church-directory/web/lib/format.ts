import type { TraditionId } from "./types";

/**
 * One colour per tradition, used by the map pins, the filter chips, and the
 * card accents so a colour always means the same thing across the app.
 */
export const TRADITION_COLORS: Record<TraditionId, string> = {
  maronite: "#b45309",
  chaldean: "#7c3aed",
  melkite: "#0f766e",
  "greek-orthodox": "#1d4ed8",
  "coptic-orthodox": "#b91c1c",
  "syriac-orthodox": "#c2410c",
  "assyrian-coe": "#4d7c0f",
};

export const TRADITION_SHORT: Record<TraditionId, string> = {
  maronite: "Maronite",
  chaldean: "Chaldean",
  melkite: "Melkite",
  "greek-orthodox": "Greek Orth.",
  "coptic-orthodox": "Coptic Orth.",
  "syriac-orthodox": "Syriac Orth.",
  "assyrian-coe": "Assyrian CoE",
};

export const CATEGORY_LABELS: Record<string, string> = {
  liturgy: "Liturgy",
  feast: "Feast",
  festival: "Festival",
  fundraiser: "Fundraiser",
  youth: "Youth",
  education: "Education",
  retreat: "Retreat",
  community: "Community",
  music: "Music",
  other: "Other",
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayName(index?: number): string | undefined {
  return index === undefined ? undefined : DAYS[index];
}

export function formatTime(hhmm?: string): string | undefined {
  if (!hhmm) return undefined;
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined) return hhmm;
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, "0")}${period}`;
}

export function formatEventDate(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  if (allDay) return date;
  return `${date}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function relativeDays(iso: string): string {
  const days = Math.round((Date.parse(iso) - Date.now()) / 864e5);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 30) return `in ${Math.round(days / 7)} wk`;
  return `in ${Math.round(days / 30)} mo`;
}
