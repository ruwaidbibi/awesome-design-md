/**
 * Stage 1c - local SEO, which is almost entirely arithmetic.
 *
 * "Keyword research" is a national-SEO frame. A barbershop does not rank for
 * "best haircut" against a national chain and should not try; it ranks in the
 * local pack, and that is won by the Google Business Profile, by NAP strings
 * matching character for character across the web, and by correct schema. All
 * three are deterministic from facts we already hold, so this file makes no
 * model call and never guesses.
 *
 * What it will not do: invent a keyword volume, a difficulty score, or a
 * ranking promise. Nothing here is a projection.
 */

/**
 * Google place type -> schema.org type.
 *
 * Getting this wrong is worse than being generic: a HairSalon marked as a
 * Restaurant invites the wrong rich result. Anything unmapped falls through to
 * LocalBusiness, which is always defensible.
 */
const SCHEMA_TYPES = {
  barber_shop: "HairSalon",
  hair_salon: "HairSalon",
  hair_care: "HairSalon",
  beauty_salon: "BeautySalon",
  nail_salon: "NailSalon",
  spa: "DaySpa",
  restaurant: "Restaurant",
  cafe: "CafeOrCoffeeShop",
  coffee_shop: "CafeOrCoffeeShop",
  bakery: "Bakery",
  bar: "BarOrPub",
  meal_takeaway: "FoodEstablishment",
  meal_delivery: "FoodEstablishment",
  pizza_restaurant: "Restaurant",
  mexican_restaurant: "Restaurant",
  car_repair: "AutoRepair",
  car_wash: "AutoWash",
  auto_parts_store: "AutoPartsStore",
  tire_shop: "AutoRepair",
  plumber: "Plumber",
  electrician: "Electrician",
  roofing_contractor: "RoofingContractor",
  general_contractor: "GeneralContractor",
  painter: "HousePainter",
  moving_company: "MovingCompany",
  locksmith: "Locksmith",
  storage: "SelfStorage",
  laundry: "DryCleaningOrLaundry",
  dry_cleaner: "DryCleaningOrLaundry",
  tailor: "ClothingStore",
  cigar_shop: "TobaccoShop",
  tobacco_shop: "TobaccoShop",
  wine_bar: "BarOrPub",
  night_club: "NightClub",
  liquor_store: "LiquorStore",
  pet_store: "PetStore",
  veterinary_care: "VeterinaryCare",
  florist: "Florist",
  gym: "ExerciseGym",
  dentist: "Dentist",
  doctor: "Physician",
  pharmacy: "Pharmacy",
  real_estate_agency: "RealEstateAgent",
  insurance_agency: "InsuranceAgency",
  lawyer: "Attorney",
  accounting: "AccountingService",
  funeral_home: "FuneralHome",
  child_care_agency: "ChildCare",
  school: "School",
  lodging: "LodgingBusiness",
};

/** The one Google field whose value changes the schema shape, not just the type. */
const FOOD = new Set(["Restaurant", "CafeOrCoffeeShop", "Bakery", "BarOrPub", "FoodEstablishment"]);

export const schemaTypeFor = (primaryType) => SCHEMA_TYPES[primaryType ?? ""] ?? "LocalBusiness";

/**
 * Split a Google `formattedAddress` into parts.
 *
 * Deliberately conservative: anything it cannot be sure of comes back null, and
 * the full string is kept so the NAP block can always be rendered exactly as
 * Google has it even when the parse is partial.
 */
export function parseAddress(formatted) {
  const full = String(formatted ?? "").trim();
  if (!full) return { full: null, street: null, city: null, state: null, postalCode: null, country: null };

  const parts = full.split(",").map((p) => p.trim()).filter(Boolean);
  const country = /^(usa|united states)$/i.test(parts.at(-1) ?? "") ? "US" : null;
  const body = country ? parts.slice(0, -1) : parts;

  // Last element of a US address is "FL 32204" or just "FL".
  const tail = body.at(-1) ?? "";
  const stateZip = /^([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/.exec(tail);

  return {
    full,
    street: body.length >= 2 ? body[0] : null,
    city: stateZip && body.length >= 3 ? body.at(-2) : body.length >= 2 && !stateZip ? body.at(-1) : null,
    state: stateZip?.[1] ?? null,
    postalCode: stateZip?.[2] ?? null,
    country,
  };
}

const CATEGORY_WORDS = {
  barber_shop: ["barber", "barbershop", "haircut", "fade", "beard trim"],
  hair_salon: ["hair salon", "haircut", "color", "blowout"],
  nail_salon: ["nail salon", "manicure", "pedicure", "gel nails"],
  restaurant: ["restaurant", "takeout", "dinner", "lunch"],
  cafe: ["cafe", "coffee", "breakfast", "espresso"],
  coffee_shop: ["coffee shop", "espresso", "latte", "cold brew"],
  bakery: ["bakery", "cakes", "pastries", "bread"],
  car_repair: ["auto repair", "mechanic", "brakes", "oil change", "check engine"],
  tire_shop: ["tires", "tire shop", "alignment", "flat repair"],
  plumber: ["plumber", "drain cleaning", "water heater", "leak repair"],
  electrician: ["electrician", "panel upgrade", "wiring", "outlet repair"],
  roofing_contractor: ["roofer", "roof repair", "roof replacement", "leak"],
  dry_cleaner: ["dry cleaning", "laundry", "alterations"],
  tailor: ["tailor", "alterations", "hemming", "suit fitting"],
  pet_store: ["pet grooming", "dog grooming", "nail trim"],
  cigar_shop: ["cigar lounge", "cigar bar", "humidor", "cigar shop"],
  tobacco_shop: ["tobacco shop", "cigar shop", "humidor"],
  bar: ["bar", "cocktail bar", "happy hour", "open late"],
  wine_bar: ["wine bar", "wine by the glass", "happy hour"],
  night_club: ["night club", "live music", "open late"],
};

const titleCase = (s) =>
  String(s ?? "").split(/[\s_]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export const categoryLabel = (primaryType, fallback = "local business") =>
  primaryType ? titleCase(primaryType).toLowerCase() : fallback;

/**
 * The searches a real customer types. Not keyword research - query *patterns*,
 * generated from the category and the geography, which is what actually matches
 * local intent.
 *
 * No volumes. We have no keyword tool and will not pretend to.
 */
export function queryPatterns(business) {
  const addr = parseAddress(business.address);
  const city = business.city ?? addr.city;
  const base = CATEGORY_WORDS[business.primary_type ?? ""] ?? [categoryLabel(business.primary_type)];
  const place = [city, addr.postalCode].filter(Boolean);

  const patterns = [];
  for (const word of base) {
    patterns.push({ query: `${word} near me`, intent: "nearby", surface: "map pack" });
    for (const p of place) patterns.push({ query: `${word} ${p}`, intent: "local", surface: "map pack" });
  }
  patterns.push({ query: business.name, intent: "branded", surface: "knowledge panel" });
  if (city) patterns.push({ query: `${business.name} ${city}`, intent: "branded", surface: "knowledge panel" });
  patterns.push({ query: `best ${base[0]} in ${city ?? "town"}`, intent: "comparison", surface: "organic + map pack" });
  patterns.push({ query: `${base[0]} open now`, intent: "immediate", surface: "map pack" });

  // De-dupe without losing the first-seen intent label.
  const seen = new Set();
  return patterns.filter((p) => (seen.has(p.query) ? false : seen.add(p.query)));
}

/** The NAP block, exactly as Google has it. Consistency is the ranking factor. */
export function napBlock(business) {
  const addr = parseAddress(business.address);
  return {
    name: business.name,
    address: addr,
    phone: business.phone ?? null,
    // Deliberately not a URL we invented. If the site gets published, the
    // caller fills this in from the real deployment.
    mapsUrl: business.google_maps_uri ?? null,
    warning:
      "These strings must match the Google Business Profile character for character wherever they appear. Do not reformat the phone number or abbreviate the street.",
  };
}

/**
 * LocalBusiness JSON-LD.
 *
 * Only fields we hold. `aggregateRating` is included because Google supplied
 * both the value and the count; it is omitted entirely when either is missing,
 * since a rating without a count is a structured-data error.
 */
export function localBusinessJsonLd(business, { siteUrl = null, pages = [] } = {}) {
  const addr = parseAddress(business.address);
  const hours = JSON.parse(business.hours_json ?? "null");

  const node = {
    "@context": "https://schema.org",
    "@type": schemaTypeFor(business.primary_type),
    name: business.name,
  };

  if (addr.full) {
    node.address = {
      "@type": "PostalAddress",
      ...(addr.street ? { streetAddress: addr.street } : {}),
      ...(addr.city ? { addressLocality: addr.city } : {}),
      ...(addr.state ? { addressRegion: addr.state } : {}),
      ...(addr.postalCode ? { postalCode: addr.postalCode } : {}),
      ...(addr.country ? { addressCountry: addr.country } : {}),
    };
  }
  if (business.phone) node.telephone = business.phone;
  if (business.lat != null && business.lng != null) {
    node.geo = { "@type": "GeoCoordinates", latitude: business.lat, longitude: business.lng };
  }
  if (Array.isArray(hours) && hours.length > 0) node.openingHours = hours;
  if (business.rating != null && business.review_count > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: business.rating,
      reviewCount: business.review_count,
      bestRating: 5,
    };
  }
  if (business.google_maps_uri) node.hasMap = business.google_maps_uri;
  if (siteUrl) node.url = siteUrl;
  if (FOOD.has(node["@type"]) && business.price_level) {
    // Google's enum is PRICE_LEVEL_INEXPENSIVE etc; schema.org wants $ signs.
    const dollars = { PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };
    if (dollars[business.price_level]) node.priceRange = dollars[business.price_level];
  }
  if (siteUrl && pages.length > 1) {
    node.mainEntityOfPage = pages.map((p) => `${siteUrl.replace(/\/$/, "")}/${p.file}`);
  }
  return node;
}

/**
 * Title and meta description per page, length-checked.
 *
 * Both are generated rather than asked of the model, because both have hard
 * pixel budgets and a model asked for "an SEO title" reliably writes 78
 * characters of adjectives.
 */
export function metaFor({ business, page, tagline }) {
  const addr = parseAddress(business.address);
  const city = business.city ?? addr.city;
  const label = categoryLabel(business.primary_type);
  const where = [city, addr.state].filter(Boolean).join(", ");

  const title =
    page.slug === "index"
      ? [business.name, where ? `${titleCase(label)} in ${where}` : titleCase(label)].join(" | ")
      : [`${page.navLabel}`, business.name].join(" | ");

  let description;
  if (page.slug === "index") {
    description = [
      tagline?.trim().replace(/\.$/, ""),
      where ? `${titleCase(label)} in ${where}` : null,
      business.phone ? `Call ${business.phone}.` : null,
    ]
      .filter(Boolean)
      .join(". ")
      .replace(/\.\./g, ".");
  } else {
    description = `${page.purpose ?? page.navLabel} ${business.name}${where ? `, ${where}` : ""}.`;
  }

  return {
    title: clamp(title, 60),
    description: clamp(description.trim(), 155),
    titleLength: clamp(title, 60).length,
    descriptionLength: clamp(description.trim(), 155).length,
  };
}

function clamp(text, max) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:|-]$/, "")}…`;
}

/**
 * What the owner should do to their Google Business Profile.
 *
 * For a shop with three hundred reviews and no site, this list is plausibly
 * worth more than the website. It is generated from gaps we can actually see.
 */
export function gbpRecommendations(business, { socials = [] } = {}) {
  const recs = [];
  const hours = JSON.parse(business.hours_json ?? "null");

  if (!business.phone) recs.push({ priority: "high", item: "Add a phone number to the Business Profile. Nothing on the site can create a call button without one." });
  if (!Array.isArray(hours) || hours.length === 0) recs.push({ priority: "high", item: "Add opening hours. 'Open now' filtering in the map pack depends on them, and customers abandon a listing without them." });
  if (business.website_status === "dead" || business.listed_url_broken) {
    recs.push({ priority: "high", item: "The website link on the profile does not resolve. Remove it or repoint it - a broken link costs clicks and looks abandoned." });
  }
  if (!business.website_uri) recs.push({ priority: "high", item: "Add the website link once this site is live. The profile is the main route to it." });
  if (business.price_level == null) recs.push({ priority: "medium", item: "Set the price range. It is a filter customers use before they ever see a listing." });
  if (socials.length === 0) recs.push({ priority: "low", item: "No social profile was found. One active profile gives the listing somewhere to point and a place to post photos." });
  recs.push({ priority: "medium", item: "Post photos regularly from the profile. Google weights recency, and owner photos are the only images that can legitimately appear anywhere we control." });
  recs.push({ priority: "medium", item: "Reply to reviews, including the negative ones, in one or two sentences. Reply rate is visible to customers reading the listing." });
  if ((business.review_count ?? 0) > 100) {
    recs.push({ priority: "low", item: `${business.review_count} reviews is already an asset most competitors cannot buy. Keep asking - volume and recency both count.` });
  }
  return recs;
}

/** Stage 1c, assembled. No network, no model, no guesses. */
export function researchLocalSeo(business, { socials = [] } = {}) {
  return {
    schemaType: schemaTypeFor(business.primary_type),
    categoryLabel: categoryLabel(business.primary_type),
    address: parseAddress(business.address),
    serviceArea: business.city ?? parseAddress(business.address).city ?? null,
    queryPatterns: queryPatterns(business),
    nap: napBlock(business),
    gbp: gbpRecommendations(business, { socials }),
    note: "Query patterns are generated from category and geography. No search volumes are available to this tool and none are implied.",
  };
}
