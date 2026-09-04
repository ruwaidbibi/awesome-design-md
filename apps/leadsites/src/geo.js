/**
 * The POC is scoped to the Jacksonville, FL metro.
 *
 * Geography is enforced two ways, and they do different jobs:
 *   - the city name goes into the text query, because Google geocodes
 *     "barber shops in Orange Park, FL" far better than any box we could draw;
 *   - METRO_BOUNDS goes into locationRestriction, which is a hard filter, so a
 *     stray match in Tampa or Savannah cannot come back at all.
 *
 * The box is deliberately coarse. It is a fence, not a targeting mechanism.
 */
export const METRO = {
  id: "jacksonville",
  label: "Jacksonville, FL metro",
  // Southwest and northeast corners. Covers Duval, Clay, St. Johns, Nassau and
  // Baker counties: St. Augustine in the south up to the Georgia line, and
  // Macclenny in the west out to the Atlantic.
  bounds: {
    low: { latitude: 29.75, longitude: -82.25 },
    high: { latitude: 30.78, longitude: -81.2 },
  },
};

/** Cities to run searches against, nearest-in first. */
export const CITIES = [
  { name: "Jacksonville", state: "FL", county: "Duval", core: true },
  { name: "Jacksonville Beach", state: "FL", county: "Duval" },
  { name: "Atlantic Beach", state: "FL", county: "Duval" },
  { name: "Neptune Beach", state: "FL", county: "Duval" },
  { name: "Orange Park", state: "FL", county: "Clay" },
  { name: "Fleming Island", state: "FL", county: "Clay" },
  { name: "Middleburg", state: "FL", county: "Clay" },
  { name: "Green Cove Springs", state: "FL", county: "Clay" },
  { name: "Ponte Vedra Beach", state: "FL", county: "St. Johns" },
  { name: "St. Augustine", state: "FL", county: "St. Johns" },
  { name: "Fernandina Beach", state: "FL", county: "Nassau" },
  { name: "Yulee", state: "FL", county: "Nassau" },
  { name: "Callahan", state: "FL", county: "Nassau" },
  { name: "Macclenny", state: "FL", county: "Baker" },
];

export const cityLabel = (city) => `${city.name}, ${city.state}`;

export const findCity = (name) =>
  CITIES.find((c) => c.name.toLowerCase() === String(name ?? "").trim().toLowerCase()) ?? null;

/** Is a point inside the metro fence? Used to sanity-check provider results. */
export function withinMetro(lat, lng) {
  if (lat == null || lng == null) return true; // nothing to check against
  const { low, high } = METRO.bounds;
  return lat >= low.latitude && lat <= high.latitude && lng >= low.longitude && lng <= high.longitude;
}

/**
 * Category presets. These are the trades where a strong review count with no
 * website is both common and worth a call, so the POC does not need a
 * free-text guess to get started.
 */
export const CATEGORIES = [
  "barber shops",
  "hair salons",
  "nail salons",
  "auto repair shops",
  "tire shops",
  "plumbers",
  "electricians",
  "roofing contractors",
  "HVAC contractors",
  "landscaping services",
  "pest control",
  "dry cleaners",
  "tailors and alterations",
  "pet grooming",
  "mexican restaurants",
  "soul food restaurants",
  "seafood restaurants",
  "bakeries",
  "food trucks",
  "car washes",
  "locksmiths",
  "moving companies",
  "dentists",
  "chiropractors",
];
