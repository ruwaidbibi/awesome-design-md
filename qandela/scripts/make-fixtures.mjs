#!/usr/bin/env node
/**
 * Generates a DEMONSTRATION dataset so the web app renders before the crawler
 * has ever run.
 *
 * Everything it produces is synthetic and deliberately named so it cannot be
 * mistaken for a real parish: "Example ... Parish", 555 phone numbers, and
 * example.org URLs. Real data only ever comes from the pipeline. The web app
 * shows a warning banner whenever it is running on this file.
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(join(root, "data/jurisdictions.json"), "utf8"));

// Metro areas where these communities are actually concentrated, so the demo
// map looks plausible in shape even though every record in it is invented.
const METROS = [
  { city: "Detroit", state: "MI", lat: 42.3314, lon: -83.0458 },
  { city: "San Diego", state: "CA", lat: 32.7157, lon: -117.1611 },
  { city: "Jersey City", state: "NJ", lat: 40.7178, lon: -74.0431 },
  { city: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 },
  { city: "Los Angeles", state: "CA", lat: 34.0522, lon: -118.2437 },
  { city: "Houston", state: "TX", lat: 29.7604, lon: -95.3698 },
  { city: "Boston", state: "MA", lat: 42.3601, lon: -71.0589 },
  { city: "Phoenix", state: "AZ", lat: 33.4484, lon: -112.074 },
  { city: "Atlanta", state: "GA", lat: 33.749, lon: -84.388 },
  { city: "Cleveland", state: "OH", lat: 41.4993, lon: -81.6944 },
];

const TITLES = ["Ascension", "Three Holy Youths", "Forty Martyrs", "Holy Cross", "Resurrection", "Nativity", "Transfiguration", "Pentecost"];
const EVENT_TITLES = [
  ["Divine Liturgy", "liturgy"], ["Feast of the Nativity", "feast"],
  ["Annual Food Festival", "festival"], ["Youth Group Night", "youth"],
  ["Bible Study", "education"], ["Parish Council Meeting", "community"],
  ["Lenten Retreat", "retreat"], ["Choir Rehearsal", "music"],
  ["Building Fund Gala", "fundraiser"],
];

// Deterministic PRNG so regenerating the fixtures produces no diff noise.
let seed = 20260904;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const parishes = [];
const events = [];
const now = new Date();
const iso = (d) => d.toISOString();

for (const tradition of registry.traditions) {
  const jurisdictions = registry.jurisdictions.filter((j) => j.tradition === tradition.id && j.enabled);
  const count = Math.min(8, Math.max(4, Math.round(tradition.estimatedUsParishes / 40)));

  for (let i = 0; i < count; i++) {
    const metro = pick(METROS);
    const jurisdiction = jurisdictions[i % Math.max(1, jurisdictions.length)] ?? { id: "unassigned" };
    const name = `Example ${tradition.name} Parish of ${pick(TITLES)} (${metro.city})`;
    const id = `demo-${tradition.id}-${i}`;
    const host = `example.org`;

    parishes.push({
      id,
      name,
      alternateNames: [],
      tradition: tradition.id,
      jurisdictionId: jurisdiction.id,
      status: i === 0 ? "cathedral" : i % 5 === 0 ? "mission" : "parish",
      address: {
        street: `${100 + i * 7} Example Street`,
        city: metro.city,
        state: metro.state,
        postalCode: String(10000 + Math.floor(rand() * 89999)),
        country: "US",
      },
      coordinates: {
        lat: metro.lat + (rand() - 0.5) * 0.4,
        lon: metro.lon + (rand() - 0.5) * 0.4,
        precision: "rooftop",
        source: "manual",
      },
      phone: `(555) ${String(100 + i).padStart(3, "0")}-01${String(i).padStart(2, "0")}`,
      email: `office@${host}`,
      website: `https://${host}/${id}`,
      clergy: [{ title: "Fr.", name: "Example Clergy Name" }],
      languages: tradition.liturgicalLanguages.slice(0, 2),
      serviceTimes: [
        { label: "Divine Liturgy", dayOfWeek: 0, time: "10:00", language: tradition.liturgicalLanguages[0] },
        { label: "Vespers", dayOfWeek: 6, time: "18:00", language: "English" },
      ],
      socials: [
        { platform: "facebook", url: `https://www.facebook.com/${id}`, handle: id,
          provenance: { source: "fixture", method: "manual", fetchedAt: iso(now), confidence: 0 } },
        { platform: "instagram", url: `https://www.instagram.com/${id}`, handle: id,
          provenance: { source: "fixture", method: "manual", fetchedAt: iso(now), confidence: 0 } },
        ...(i % 3 === 0 ? [{ platform: "youtube", url: `https://www.youtube.com/@${id}`, handle: id,
          provenance: { source: "fixture", method: "manual", fetchedAt: iso(now), confidence: 0 } }] : []),
      ],
      feeds: [{ type: "ical", url: `https://${host}/${id}/calendar.ics` }],
      provenance: [{ source: "fixture", method: "manual", fetchedAt: iso(now), confidence: 0 }],
      mergedFrom: [],
      firstSeenAt: iso(now),
      lastSeenAt: iso(now),
      flags: ["demonstration-data"],
    });

    const eventCount = 2 + Math.floor(rand() * 4);
    for (let e = 0; e < eventCount; e++) {
      const [title, category] = pick(EVENT_TITLES);
      const start = new Date(now.getTime() + (1 + Math.floor(rand() * 90)) * 864e5);
      start.setUTCHours(14 + Math.floor(rand() * 6), 0, 0, 0);
      events.push({
        id: `${id}--evt-${e}`,
        parishId: id,
        title: `${title} (demo)`,
        description: "Demonstration record. Not a real event.",
        start: iso(start),
        end: iso(new Date(start.getTime() + 2 * 36e5)),
        allDay: false,
        location: `${metro.city}, ${metro.state}`,
        url: `https://${host}/${id}/events`,
        category,
        provenance: { source: "fixture", method: "manual", fetchedAt: iso(now), confidence: 0 },
        cancelled: false,
      });
    }
  }
}

const dataset = {
  generatedAt: iso(now),
  version: "0.1.0-fixture",
  demonstrationData: true,
  counts: {
    parishes: parishes.length,
    events: events.length,
    socials: parishes.reduce((n, p) => n + p.socials.length, 0),
    withCoordinates: parishes.length,
  },
  parishes,
  events: events.sort((a, b) => a.start.localeCompare(b.start)),
};

mkdirSync(join(root, "data/fixtures"), { recursive: true });
writeFileSync(join(root, "data/fixtures/sample-dataset.json"), `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`fixtures: ${parishes.length} synthetic parishes, ${events.length} synthetic events`);
