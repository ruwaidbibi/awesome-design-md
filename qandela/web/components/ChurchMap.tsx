"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { TRADITION_COLORS, TRADITION_SHORT } from "@/lib/format";
import type { ParishSummary } from "@/lib/data";

/**
 * The default basemap is OpenStreetMap's raster tiles, which are free but rate
 * limited and not intended for heavy production traffic. Point
 * NEXT_PUBLIC_MAP_STYLE at your own vector style (MapTiler, Protomaps, a self
 * hosted tileserver) before putting this in front of real users.
 */
const OSM_RASTER: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

interface Props {
  parishes: ParishSummary[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export default function ChurchMap({ parishes, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!container.current || map.current) return;

    const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE;
    map.current = new maplibregl.Map({
      container: container.current,
      style: styleUrl ?? OSM_RASTER,
      center: [-96, 38.5],
      zoom: 3.2,
      attributionControl: { compact: true },
    });
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Markers are plain DOM rather than a GeoJSON layer: at ~1,500 points the
  // cost is negligible and it keeps click handling and styling in React.
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    for (const marker of markers.current) marker.remove();
    markers.current = [];

    for (const parish of parishes) {
      if (parish.lat === undefined || parish.lon === undefined) continue;

      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", parish.name);
      const selected = parish.id === selectedId;
      const size = selected ? 18 : parish.eventCount > 0 ? 13 : 10;
      Object.assign(el.style, {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: TRADITION_COLORS[parish.tradition] ?? "#666",
        border: selected ? "3px solid #fff" : "1.5px solid rgba(255,255,255,0.85)",
        boxShadow: selected ? "0 0 0 2px rgba(0,0,0,0.35)" : "0 1px 3px rgba(0,0,0,0.35)",
        cursor: "pointer",
        padding: "0",
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current?.(parish.id);
      });

      const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(
        `<strong>${escapeHtml(parish.name)}</strong><br>` +
          `<span style="opacity:.7">${escapeHtml(TRADITION_SHORT[parish.tradition] ?? parish.tradition)}` +
          `${parish.city ? ` · ${escapeHtml(parish.city)}, ${escapeHtml(parish.state ?? "")}` : ""}</span>` +
          (parish.eventCount ? `<br><span style="opacity:.7">${parish.eventCount} upcoming</span>` : ""),
      );

      markers.current.push(
        new maplibregl.Marker({ element: el }).setLngLat([parish.lon, parish.lat]).setPopup(popup).addTo(m),
      );
    }
  }, [parishes, selectedId]);

  // Recentre when the filtered set changes, so filtering to one tradition
  // actually shows that tradition rather than the whole country.
  useEffect(() => {
    const m = map.current;
    const placed = parishes.filter((p) => p.lat !== undefined && p.lon !== undefined);
    if (!m || placed.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const p of placed) bounds.extend([p.lon!, p.lat!]);
    m.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 600 });
  }, [parishes]);

  return (
    <div
      ref={container}
      className="h-[420px] w-full overflow-hidden rounded-lg border border-[var(--color-line)] lg:h-[calc(100vh-13rem)]"
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
