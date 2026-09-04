/**
 * Sample Jacksonville-area data so the whole pipeline (filter -> validate ->
 * score -> reviews -> generate -> review -> publish) is exercisable with no
 * Google key and no billing.
 *
 * These are invented businesses at invented addresses. The website fields are a
 * deliberate mix so every branch of the validator gets hit: absent, social-only,
 * directory-only, a domain that does not resolve, and a real live site that
 * should be rejected.
 */
const FIXTURES = [
  { id: "fx-001", name: "Vera's Tortilleria", type: "mexican_restaurant", city: "Jacksonville", reviews: 412, rating: 4.7,
    phone: "(904) 555-0142", address: "1804 N Main St, Jacksonville, FL 32206", lat: 30.3593, lng: -81.6551, website: null },
  { id: "fx-002", name: "Murray Hill Barber Co", type: "barber_shop", city: "Jacksonville", reviews: 287, rating: 4.9,
    phone: "(904) 555-0119", address: "1054 Edgewood Ave S, Jacksonville, FL 32205", lat: 30.3095, lng: -81.7135, website: null },
  { id: "fx-003", name: "Kim's Alterations & Tailoring", type: "tailor", city: "Jacksonville", reviews: 233, rating: 4.8,
    phone: "(904) 555-0177", address: "9825 San Jose Blvd, Jacksonville, FL 32257", lat: 30.1889, lng: -81.6222, website: null },
  { id: "fx-004", name: "Blanding Auto & Tire", type: "car_repair", city: "Orange Park", reviews: 664, rating: 4.6,
    phone: "(904) 555-0188", address: "1420 Kingsley Ave, Orange Park, FL 32073", lat: 30.1669, lng: -81.7062,
    website: "https://www.facebook.com/blandingautotire" },
  { id: "fx-005", name: "Casa Lupita Bakery", type: "bakery", city: "Jacksonville", reviews: 351, rating: 4.5,
    phone: "(904) 555-0155", address: "5510 Beach Blvd, Jacksonville, FL 32207", lat: 30.2938, lng: -81.6072,
    website: "https://www.instagram.com/casalupitabakery" },
  { id: "fx-006", name: "Fleming Island Family Dental", type: "dentist", city: "Fleming Island", reviews: 205, rating: 4.9,
    phone: "(904) 555-0133", address: "1650 Eagle Harbor Pkwy, Fleming Island, FL 32003", lat: 30.0953, lng: -81.7188,
    website: "https://www.yelp.com/biz/fleming-island-family-dental" },
  { id: "fx-007", name: "First Coast Roofing Co", type: "roofing_contractor", city: "Jacksonville", reviews: 318, rating: 4.4,
    phone: "(904) 555-0166", address: "7200 Philips Hwy, Jacksonville, FL 32256", lat: 30.2312, lng: -81.5723,
    website: "https://first-coast-roofing-co-jax-example.invalid" },
  { id: "fx-008", name: "Third Street Nail Spa", type: "nail_salon", city: "Jacksonville Beach", reviews: 529, rating: 4.3,
    phone: "(904) 555-0121", address: "1220 3rd St S, Jacksonville Beach, FL 32250", lat: 30.2795, lng: -81.3925, website: null },
  { id: "fx-009", name: "Westside Plumbing Supply", type: "plumber", city: "Jacksonville", reviews: 247, rating: 4.7,
    phone: "(904) 555-0198", address: "5340 Normandy Blvd, Jacksonville, FL 32205", lat: 30.3106, lng: -81.7442, website: null },
  { id: "fx-010", name: "Papa Nick's Pizzeria", type: "pizza_restaurant", city: "Jacksonville", reviews: 903, rating: 4.6,
    phone: "(904) 555-0107", address: "1965 San Marco Blvd, Jacksonville, FL 32207", lat: 30.3057, lng: -81.6537,
    website: "https://www.example.com" },
  { id: "fx-011", name: "Avondale Dry Cleaners", type: "laundry", city: "Jacksonville", reviews: 214, rating: 4.5,
    phone: "(904) 555-0173", address: "3568 St Johns Ave, Jacksonville, FL 32205", lat: 30.3021, lng: -81.7062, website: null },
  { id: "fx-012", name: "Ponte Vedra Pet Grooming", type: "pet_store", city: "Ponte Vedra Beach", reviews: 376, rating: 4.8,
    phone: "(904) 555-0164", address: "330 A1A N, Ponte Vedra Beach, FL 32082", lat: 30.2216, lng: -81.3857,
    website: "https://www.facebook.com/pontevedrapetgrooming" },
  { id: "fx-013", name: "The Corner Coffee Stand", type: "coffee_shop", city: "Jacksonville", reviews: 58, rating: 4.9,
    phone: "(904) 555-0150", address: "117 E Bay St, Jacksonville, FL 32202", lat: 30.3268, lng: -81.6552, website: null },
  { id: "fx-014", name: "First Coast Locksmith 24/7", type: "locksmith", city: "Jacksonville", reviews: 291, rating: 4.2,
    phone: "(904) 555-0184", address: "2255 University Blvd N, Jacksonville, FL 32211", lat: 30.3486, lng: -81.5946, website: null },
  { id: "fx-015", name: "Amelia Island Seafood Market", type: "seafood_restaurant", city: "Fernandina Beach", reviews: 488, rating: 4.7,
    phone: "(904) 555-0129", address: "18 S 2nd St, Fernandina Beach, FL 32034", lat: 30.6697, lng: -81.4637, website: null },
  { id: "fx-016", name: "St. Augustine Coquina Landscaping", type: "landscaping_service", city: "St. Augustine", reviews: 262, rating: 4.6,
    phone: "(904) 555-0192", address: "1740 US-1 S, St. Augustine, FL 32084", lat: 29.8613, lng: -81.3128, website: null },
];

const HOURS = [
  "Monday: 9:00 AM – 6:00 PM",
  "Tuesday: 9:00 AM – 6:00 PM",
  "Wednesday: 9:00 AM – 6:00 PM",
  "Thursday: 9:00 AM – 6:00 PM",
  "Friday: 9:00 AM – 7:00 PM",
  "Saturday: 10:00 AM – 4:00 PM",
  "Sunday: Closed",
];

/**
 * Invented reviews, written to carry the same signal real ones do: which
 * services people actually name, and what they praise. This is what the
 * content brief is built from.
 */
const REVIEWS = {
  "fx-002": [
    { rating: 5, author: "Darius W.", when: "2 months ago", text: "Been coming here for six years. Best fade in Murray Hill, and the hot towel shave is worth the extra ten minutes. Walk-ins usually get seen inside half an hour." },
    { rating: 5, author: "Tanya R.", when: "a month ago", text: "Took both my boys for back-to-school cuts. They're great with kids and didn't rush. Cash or card, no fuss." },
    { rating: 5, author: "Mike P.", when: "3 weeks ago", text: "Beard trim and line up every two weeks. Marcus knows exactly what I want by now. Saturday mornings get busy so come early." },
    { rating: 4, author: "Chris A.", when: "5 months ago", text: "Solid straight razor shave and good conversation. Only knocking a star because parking on Edgewood is tight." },
    { rating: 5, author: "Renée B.", when: "a week ago", text: "Old school shop, new school skills. They do tapers, designs, and my dad's regular trim all in the same chair." },
  ],
  "fx-001": [
    { rating: 5, author: "Alma G.", when: "a month ago", text: "The tortillas are pressed while you wait and still warm in the bag. Get the carnitas and a dozen corn." },
    { rating: 5, author: "Jorge M.", when: "2 weeks ago", text: "Family run, been on Main Street forever. Tamales on weekends sell out by noon. Cash preferred." },
    { rating: 4, author: "Beth K.", when: "3 months ago", text: "Small counter, mostly takeout. The salsa verde is the reason I drive across town." },
    { rating: 5, author: "Devon L.", when: "6 days ago", text: "They cater. We did 80 people for a work thing and it was flawless." },
  ],
  "fx-008": [
    { rating: 5, author: "Priya S.", when: "a month ago", text: "Gel manicure lasted three weeks. They're meticulous about sanitizing and it shows." },
    { rating: 4, author: "Hannah T.", when: "2 months ago", text: "Pedicure chairs are comfortable and they never rush. Appointments are better than walk-ins on weekends." },
    { rating: 5, author: "Marisol D.", when: "3 weeks ago", text: "Best nail art at the beaches. Bring a photo and they'll match it." },
  ],
};

export async function searchPlaces({ query, location }) {
  const needle = String(query ?? "").trim().toLowerCase();
  const words = needle.split(/\s+/).filter((w) => w.length > 2);
  const city = String(location ?? "").split(",")[0].trim().toLowerCase();

  let pool = FIXTURES;
  if (city) {
    const inCity = FIXTURES.filter((f) => f.city.toLowerCase() === city);
    if (inCity.length > 0) pool = inCity;
  }

  const matches = pool.filter((f) => {
    if (words.length === 0) return true;
    const hay = `${f.name} ${f.type.replace(/_/g, " ")}`.toLowerCase();
    return words.some((w) => hay.includes(w));
  });

  const chosen = matches.length > 0 ? matches : pool;

  return {
    pages: 1,
    requestCount: 0,
    places: chosen.map((f) => ({
      id: f.id,
      name: f.name,
      address: f.address,
      lat: f.lat,
      lng: f.lng,
      phone: f.phone,
      rating: f.rating,
      review_count: f.reviews,
      website_uri: f.website,
      google_maps_uri: `https://maps.google.com/?cid=${f.id}`,
      primary_type: f.type,
      types_json: JSON.stringify([f.type, "point_of_interest", "establishment"]),
      business_status: "OPERATIONAL",
      hours_json: JSON.stringify(HOURS),
    })),
  };
}

/** A tiny generated checkerboard, so the photo-analysis path is exercisable offline. */
const SAMPLE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAYklEQVR4nO3PQQkAMBADwZNT/1RgNSRQuMdEwJKZG+6E+90fAAAAAAAAAAAAAIAasO1Q2gcAAAAAAAAAAAAA6AHbDqV9AAAAAAAAAAAAAIAesO1Q2gcAAAAAAAAAAAAAqPsPWZ+hLfZmcTEAAAAASUVORK5CYII=";

export async function fetchPhotoMedia() {
  return { bytes: Buffer.from(SAMPLE_PNG, "base64"), mediaType: "image/png", billedRequests: 0 };
}

export async function fetchPlaceDetails(placeId) {
  const fixture = FIXTURES.find((f) => f.id === placeId);
  if (!fixture) throw new Error(`No fixture for ${placeId}`);
  return {
    reviews: REVIEWS[placeId] ?? [],
    photoNames: REVIEWS[placeId] ? [`places/${placeId}/photos/sample-1`, `places/${placeId}/photos/sample-2`] : [],
    editorialSummary: REVIEWS[placeId]
      ? null
      : "Sample data has no reviews for this business - try Murray Hill Barber Co, Vera's Tortilleria, or Third Street Nail Spa.",
    priceLevel: null,
    typeDisplayName: fixture.type.replace(/_/g, " "),
    hours: HOURS,
    billedRequests: 0,
  };
}
