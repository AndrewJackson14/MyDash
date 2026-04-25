// RouteMap — Mapbox GL JS preview embedded at the top of DriverRoute.
//
// Renders:
//   - Numbered pins for ALL stops in the route (delivered=green-fill,
//     skipped=red-fill, current=gold-fill larger, upcoming=white-fill)
//   - Blue GPS dot (currentLat/Lng prop, updated every 30s by parent)
//   - Map starts fitted to all stops + GPS; auto-recenter on
//     currentStopId change so the next stop is in view
//   - Tap a pin → onPinTap(stopId) so DriverRoute can jump to it
//
// Graceful fallback: if VITE_MAPBOX_CLIENT_TOKEN isn't set or Mapbox
// fails to load, render a simple panel with the current stop's
// address + a "Navigate" link. Driver still has everything they need.
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = import.meta.env.VITE_MAPBOX_CLIENT_TOKEN || "";

const COLOR_CURRENT  = "#B8893A";  // gold
const COLOR_DONE     = "#2F855A";  // green
const COLOR_SKIPPED  = "#C53030";  // red
const COLOR_UPCOMING = "#FFFFFF";  // white
const COLOR_GPS      = "#3B82F6";  // blue

export default function RouteMap({
  stops,           // [{id, lat, lng, name, status: 'delivered' | 'skipped' | 'pending' | 'current'}]
  currentLat,
  currentLng,
  currentStopId,
  onPinTap,
  height = 240,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const gpsMarkerRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  // Init the map once.
  useEffect(() => {
    if (!TOKEN) { setError("Map unavailable (no Mapbox token in env)"); return; }
    if (!containerRef.current) return;
    if (mapRef.current) return;

    try {
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [-120.66, 35.49], // SLO county fallback center
        zoom: 9,
        attributionControl: false,
        cooperativeGestures: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => { mapRef.current = map; setReady(true); });
      map.on("error", (e) => {
        console.warn("Mapbox error:", e?.error?.message || e);
        if (e?.error?.message?.toLowerCase()?.includes("token")) {
          setError("Map unavailable (Mapbox token rejected)");
        }
      });
    } catch (e) {
      setError(`Map init failed: ${String(e?.message ?? e)}`);
    }

    return () => {
      try { mapRef.current?.remove(); } catch { /* ok */ }
      mapRef.current = null;
    };
  }, []);

  // Render markers (clears + redraws when stops change).
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    // Clear existing
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const validStops = (stops || []).filter(s => typeof s.lat === "number" && typeof s.lng === "number");
    for (let i = 0; i < validStops.length; i++) {
      const s = validStops[i];
      const isCurrent = s.id === currentStopId;
      const fill = s.status === "delivered" ? COLOR_DONE
                : s.status === "skipped"   ? COLOR_SKIPPED
                : isCurrent                ? COLOR_CURRENT
                                            : COLOR_UPCOMING;
      const el = document.createElement("div");
      el.style.cssText = `
        width: ${isCurrent ? 32 : 22}px; height: ${isCurrent ? 32 : 22}px;
        border-radius: 50%; background: ${fill};
        border: 2px solid #FFFFFF;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
        color: ${isCurrent || s.status === "delivered" || s.status === "skipped" ? "#FFFFFF" : "#0F1419"};
        font-weight: 800; font-size: ${isCurrent ? 13 : 10};
        cursor: pointer;
      `;
      el.textContent = s.status === "delivered" ? "✓" : s.status === "skipped" ? "×" : String(i + 1);
      el.onclick = () => onPinTap?.(s.id);
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(mapRef.current);
      markersRef.current.push(marker);
    }
  }, [stops, currentStopId, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS dot
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (typeof currentLat !== "number" || typeof currentLng !== "number") return;
    if (!gpsMarkerRef.current) {
      const dot = document.createElement("div");
      dot.style.cssText = `
        width: 16px; height: 16px; border-radius: 50%;
        background: ${COLOR_GPS}; border: 3px solid #FFFFFF;
        box-shadow: 0 0 0 4px ${COLOR_GPS}40, 0 2px 4px rgba(0,0,0,0.3);
      `;
      gpsMarkerRef.current = new mapboxgl.Marker({ element: dot }).setLngLat([currentLng, currentLat]).addTo(mapRef.current);
    } else {
      gpsMarkerRef.current.setLngLat([currentLng, currentLat]);
    }
  }, [currentLat, currentLng, ready]);

  // Fit map to GPS + current stop on currentStopId change.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const validStops = (stops || []).filter(s => typeof s.lat === "number" && typeof s.lng === "number");
    const cur = validStops.find(s => s.id === currentStopId);
    if (!cur) return;
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([cur.lng, cur.lat]);
    if (typeof currentLat === "number" && typeof currentLng === "number") {
      bounds.extend([currentLng, currentLat]);
    }
    try {
      mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 600 });
    } catch { /* ignore */ }
  }, [currentStopId, ready]); // intentionally omit currentLat/Lng to avoid jitter

  // Fallback panel — Map unavailable, but driver still has the data
  if (error) {
    const cur = (stops || []).find(s => s.id === currentStopId);
    return <div style={{
      height, background: "#1A1F2E", color: "#94A3B8",
      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
      padding: 16, fontSize: 13, gap: 8, textAlign: "center",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#94A3B8" }}>{error}</div>
      {cur && <a
        href={`https://maps.apple.com/?daddr=${cur.lat},${cur.lng}`}
        target="_blank" rel="noreferrer"
        style={{
          display: "inline-block", padding: "10px 18px", background: COLOR_CURRENT,
          color: "#0F1419", fontWeight: 800, fontSize: 14,
          borderRadius: 8, textDecoration: "none",
        }}
      >Open in Maps →</a>}
    </div>;
  }

  return <div ref={containerRef} style={{ width: "100%", height, background: "#1A1F2E" }} />;
}
