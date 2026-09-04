import type { Address } from "../schema.js";

const STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA",
  "RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","PR","GU","VI","AS","MP",
]);

const STATE_NAMES: Record<string, string> = {
  alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",colorado:"CO",connecticut:"CT",
  delaware:"DE",florida:"FL",georgia:"GA",hawaii:"HI",idaho:"ID",illinois:"IL",indiana:"IN",iowa:"IA",
  kansas:"KS",kentucky:"KY",louisiana:"LA",maine:"ME",maryland:"MD",massachusetts:"MA",michigan:"MI",
  minnesota:"MN",mississippi:"MS",missouri:"MO",montana:"MT",nebraska:"NE",nevada:"NV",
  "new hampshire":"NH","new jersey":"NJ","new mexico":"NM","new york":"NY","north carolina":"NC",
  "north dakota":"ND",ohio:"OH",oklahoma:"OK",oregon:"OR",pennsylvania:"PA","rhode island":"RI",
  "south carolina":"SC","south dakota":"SD",tennessee:"TN",texas:"TX",utah:"UT",vermont:"VT",
  virginia:"VA",washington:"WA","west virginia":"WV",wisconsin:"WI",wyoming:"WY",
  "district of columbia":"DC","puerto rico":"PR",
};

export function normalizeState(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  if (STATES.has(upper)) return upper;
  return STATE_NAMES[trimmed.toLowerCase()];
}

/**
 * A deliberately narrow US address parser. It only claims a result when it can
 * anchor on "CITY, ST ZIP", which is the one shape essentially every American
 * church site produces. Anything looser is left to the geocoder or the LLM
 * step rather than guessed at here.
 */
export function parseUsAddress(text?: string): Address | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
  const m = clean.match(
    /^(.*?)[,\s]+([A-Za-z .'-]+?),\s*([A-Za-z]{2}|[A-Za-z ]{4,20})\.?\s+(\d{5})(?:-\d{4})?\b/,
  );
  if (!m) return undefined;

  const state = normalizeState(m[3]);
  if (!state) return undefined;

  const street = m[1]?.replace(/^[,\s]+|[,\s]+$/g, "") || undefined;
  const city = m[2]?.trim() || undefined;
  const postalCode = m[4];

  return {
    street,
    city,
    state,
    postalCode,
    country: "US",
    formatted: [street, city && `${city},`, state, postalCode].filter(Boolean).join(" "),
  };
}

export function normalizePhone(input?: string): string | undefined {
  if (!input) return undefined;
  const digits = input.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return undefined;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
