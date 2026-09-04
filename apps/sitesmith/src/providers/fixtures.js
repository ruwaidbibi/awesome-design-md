/**
 * Sample data so the whole pipeline (filter -> validate -> score -> generate ->
 * review -> publish) is exercisable with no Google key and no billing.
 *
 * These are invented businesses. The websites are a deliberate mix so every
 * branch of the validator gets hit: absent, social-only, directory-only, a
 * domain that does not resolve, and a real live site that should be rejected.
 */
const FIXTURES = [
  { id: "fx-001", name: "Vera's Tortilleria", type: "mexican_restaurant", reviews: 412, rating: 4.7,
    phone: "(512) 555-0142", address: "1804 E Cesar Chavez St, Austin, TX 78702", website: null },
  { id: "fx-002", name: "Northside Barber Lounge", type: "barber_shop", reviews: 287, rating: 4.9,
    phone: "(512) 555-0119", address: "5310 Burnet Rd, Austin, TX 78756", website: null },
  { id: "fx-003", name: "Kim's Alterations & Tailoring", type: "tailor", reviews: 233, rating: 4.8,
    phone: "(512) 555-0177", address: "9070 Research Blvd, Austin, TX 78758", website: null },
  { id: "fx-004", name: "Bluebonnet Auto Repair", type: "car_repair", reviews: 664, rating: 4.6,
    phone: "(512) 555-0188", address: "2200 S Lamar Blvd, Austin, TX 78704",
    website: "https://www.facebook.com/bluebonnetautoatx" },
  { id: "fx-005", name: "Casa Lupita Bakery", type: "bakery", reviews: 351, rating: 4.5,
    phone: "(512) 555-0155", address: "6800 N Lamar Blvd, Austin, TX 78752",
    website: "https://www.instagram.com/casalupitabakery" },
  { id: "fx-006", name: "Elmwood Dental Care", type: "dentist", reviews: 205, rating: 4.9,
    phone: "(512) 555-0133", address: "3300 W Anderson Ln, Austin, TX 78757",
    website: "https://www.yelp.com/biz/elmwood-dental-care-austin" },
  { id: "fx-007", name: "Rio Grande Roofing Co", type: "roofing_contractor", reviews: 318, rating: 4.4,
    phone: "(512) 555-0166", address: "11500 Manchaca Rd, Austin, TX 78748",
    website: "https://rio-grande-roofing-co-atx-example.invalid" },
  { id: "fx-008", name: "Sunset Valley Nail Spa", type: "nail_salon", reviews: 529, rating: 4.3,
    phone: "(512) 555-0121", address: "5400 Brodie Ln, Austin, TX 78745", website: null },
  { id: "fx-009", name: "Hill Country Plumbing Supply", type: "plumber", reviews: 247, rating: 4.7,
    phone: "(512) 555-0198", address: "8200 Research Blvd, Austin, TX 78758", website: null },
  { id: "fx-010", name: "Papa Nick's Pizzeria", type: "pizza_restaurant", reviews: 903, rating: 4.6,
    phone: "(512) 555-0107", address: "413 W 2nd St, Austin, TX 78701",
    website: "https://www.example.com" },
  { id: "fx-011", name: "Congress Ave Dry Cleaners", type: "laundry", reviews: 214, rating: 4.5,
    phone: "(512) 555-0173", address: "1601 S Congress Ave, Austin, TX 78704", website: null },
  { id: "fx-012", name: "Zilker Pet Grooming", type: "pet_store", reviews: 376, rating: 4.8,
    phone: "(512) 555-0164", address: "2110 Barton Springs Rd, Austin, TX 78704",
    website: "https://www.facebook.com/zilkerpetgrooming" },
  { id: "fx-013", name: "The Corner Coffee Stand", type: "coffee_shop", reviews: 58, rating: 4.9,
    phone: "(512) 555-0150", address: "701 E 6th St, Austin, TX 78701", website: null },
  { id: "fx-014", name: "Lone Star Locksmith 24/7", type: "locksmith", reviews: 291, rating: 4.2,
    phone: "(512) 555-0184", address: "1200 E 51st St, Austin, TX 78723", website: null },
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

export async function searchPlaces({ query }) {
  const needle = String(query ?? "").trim().toLowerCase();
  const words = needle.split(/\s+/).filter((w) => w.length > 2);

  const matches = FIXTURES.filter((f) => {
    if (words.length === 0) return true;
    const hay = `${f.name} ${f.type}`.toLowerCase();
    return words.some((w) => hay.includes(w) || w.includes(f.type.split("_")[0]));
  });

  const chosen = matches.length > 0 ? matches : FIXTURES;

  return {
    pages: 1,
    requestCount: 0,
    places: chosen.map((f) => ({
      id: f.id,
      name: f.name,
      address: f.address,
      lat: 30.2672,
      lng: -97.7431,
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
