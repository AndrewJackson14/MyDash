// DriverRoute — the main delivery view at /driver/route/{instance_id}.
//
// One stop visible at a time. Header shows stop counter. Map zone
// shows current stop + GPS dot + all-stop pins. Stop card shows
// per-pub qty + location notes + per-instance note input. Big gold
// CONFIRM button → writes stop_confirmation, auto-advances. Skip
// → bottom sheet → reason → log + advance.
//
// Phase 7 first cut: end-to-end happy path. Coming in follow-ups:
//   - Photo upload (button is wired but disabled with TODO)
//   - "All Stops" sheet from More menu
//   - Edit confirmed stop banner
//   - Service Desk ticket auto-create on escalate-reason skips
//   - Undo toast after auto-advance
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import RouteMap from "./RouteMap";
import SkipReasonSheet from "./SkipReasonSheet";

const TEXT = "#E8EAED";
const MUTED = "#94A3B8";
const GOLD = "#B8893A";
const GREEN = "#2F855A";
const RED = "#C53030";
const BG = "#0F1419";
const PANEL_BG = "#1A1F2E";
const PANEL_BD = "#2D3548";

// GPS write cadence — one ping every 30s while driver is in-route.
const GPS_PING_MS = 30000;

export default function DriverRoute({ instanceId, driverId, onBack, onComplete }) {
  // ── Data state ───────────────────────────────────────────────
  const [instance, setInstance] = useState(null);
  const [route, setRoute] = useState(null);
  const [stops, setStops] = useState([]);          // route_stops ordered
  const [locsById, setLocsById] = useState(new Map());
  const [pubsByLoc, setPubsByLoc] = useState(new Map()); // drop_location_id → [{publication_id, quantity}]
  const [routePubs, setRoutePubs] = useState([]);  // [{publication_id, is_primary}]
  const [pubsById, setPubsById] = useState(new Map()); // pub_id → name (just for display)
  const [confirms, setConfirms] = useState([]);    // existing stop_confirmations
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── UI state ─────────────────────────────────────────────────
  const [currentIdx, setCurrentIdx] = useState(0);
  const [skipOpen, setSkipOpen] = useState(false);
  const [confirmingNotes, setConfirmingNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [gps, setGps] = useState({ lat: null, lng: null, accuracy: null, status: "pending" });

  // ── Load route data ──────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: ri, error: riErr } = await supabase
        .from("route_instances")
        .select("*")
        .eq("id", instanceId)
        .single();
      if (riErr || !ri) throw new Error(riErr?.message || "Route instance not found");
      setInstance(ri);

      const [rRes, sRes, cRes, rpRes] = await Promise.all([
        supabase.from("driver_routes").select("*").eq("id", ri.route_template_id).single(),
        supabase.from("route_stops").select("*").eq("route_id", ri.route_template_id).order("stop_order"),
        supabase.from("stop_confirmations").select("*").eq("route_instance_id", ri.id),
        supabase.from("driver_route_pubs").select("publication_id, is_primary").eq("route_id", ri.route_template_id),
      ]);
      setRoute(rRes.data || null);
      setStops(sRes.data || []);
      setConfirms(cRes.data || []);
      setRoutePubs(rpRes.data || []);

      // Drop locations referenced by these stops.
      const locIds = (sRes.data || []).map(s => s.drop_location_id);
      if (locIds.length) {
        const [lRes, lpRes, pubsRes] = await Promise.all([
          supabase.from("drop_locations").select("*").in("id", locIds),
          supabase.from("drop_location_pubs").select("*").in("drop_location_id", locIds),
          supabase.from("publications").select("id, name"),
        ]);
        const lMap = new Map();
        for (const l of (lRes.data || [])) lMap.set(l.id, l);
        setLocsById(lMap);

        const pMap = new Map();
        for (const lp of (lpRes.data || [])) {
          if (!pMap.has(lp.drop_location_id)) pMap.set(lp.drop_location_id, []);
          pMap.get(lp.drop_location_id).push({ publication_id: lp.publication_id, quantity: lp.quantity });
        }
        setPubsByLoc(pMap);

        const pubMap = new Map();
        for (const p of (pubsRes.data || [])) pubMap.set(p.id, p);
        setPubsById(pubMap);
      }

      // Resume at first un-confirmed stop, or stop 0.
      const confirmedIds = new Set((cRes.data || []).map(c => c.drop_location_id + ":" + c.stop_order));
      const ordered = (sRes.data || []).slice().sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0));
      const firstUnconfirmed = ordered.findIndex(s => !confirmedIds.has(s.drop_location_id + ":" + (s.stop_order ?? 0)));
      setCurrentIdx(firstUnconfirmed >= 0 ? firstUnconfirmed : 0);

      // Mark instance in_progress on first arrival (idempotent).
      if (ri.status === "scheduled" || ri.status === "sms_sent") {
        await supabase.from("route_instances")
          .update({ status: "in_progress", started_at: ri.started_at || new Date().toISOString() })
          .eq("id", ri.id);
      }
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  // ── GPS — initial fix + continuous tracking ─────────────────
  useEffect(() => {
    if (!instance) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGps({ lat: null, lng: null, accuracy: null, status: "unsupported" });
      return;
    }

    const onPos = (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      setGps({ lat: latitude, lng: longitude, accuracy, status: "ok" });
    };
    const onErr = (err) => {
      console.warn("GPS:", err.message);
      setGps(g => ({ ...g, status: err.code === 1 ? "denied" : "unavailable" }));
    };
    const opts = { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 };
    const watchId = navigator.geolocation.watchPosition(onPos, onErr, opts);

    // Persist track ping every 30s while route is active.
    const pinger = setInterval(async () => {
      // Use functional setGps callback to avoid stale closure on g
      setGps(g => {
        if (g?.lat && g?.lng && instance?.id && driverId) {
          supabase.from("route_gps_track").insert({
            route_instance_id: instance.id,
            driver_id: driverId,
            lat: g.lat, lng: g.lng,
            accuracy_m: g.accuracy ? Math.min(99999, Math.round(g.accuracy * 100) / 100) : null,
          }).then(() => {}).catch(() => {});
        }
        return g;
      });
    }, GPS_PING_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(pinger);
    };
  }, [instance, driverId]);

  // ── Derived state ─────────────────────────────────────────────
  const orderedStops = useMemo(
    () => stops.slice().sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0)),
    [stops]
  );
  const totalStops = orderedStops.length;
  const currentStop = orderedStops[currentIdx];
  const currentLoc = currentStop ? locsById.get(currentStop.drop_location_id) : null;
  const currentLocPubs = currentStop ? (pubsByLoc.get(currentStop.drop_location_id) || []) : [];

  const confirmStatusByStop = useMemo(() => {
    const m = new Map();
    for (const c of confirms) {
      m.set(c.drop_location_id + ":" + c.stop_order, c.status);
    }
    return m;
  }, [confirms]);
  const completedCount = useMemo(() => confirms.filter(c => c.status === "delivered" || c.status === "partial").length, [confirms]);
  const skippedCount = useMemo(() => confirms.filter(c => c.status === "skipped").length, [confirms]);

  // Map data: each stop with status + lat/lng (from drop_locations).
  const mapStops = useMemo(() => {
    return orderedStops.map((s, i) => {
      const loc = locsById.get(s.drop_location_id);
      const status = confirmStatusByStop.get(s.drop_location_id + ":" + (s.stop_order ?? 0)) || "pending";
      return {
        id: s.id,
        lat: loc?.lat,
        lng: loc?.lng,
        name: loc?.name,
        status: i === currentIdx && status === "pending" ? "pending" : status,
      };
    });
  }, [orderedStops, locsById, confirmStatusByStop, currentIdx]);

  // ── Handlers ─────────────────────────────────────────────────
  const onConfirmDelivery = async () => {
    if (!currentStop || confirming) return;
    setConfirming(true);
    try {
      // Sum expected_qty (route_stops) — falls back to drop_location_pubs total
      // if the stop's expected_qty is 0.
      const expected = currentStop.expected_qty
        || currentLocPubs.reduce((s, p) => s + (p.quantity || 0), 0);
      const { data: conf, error: cErr } = await supabase.from("stop_confirmations").insert({
        route_instance_id: instance.id,
        drop_location_id: currentStop.drop_location_id,
        publication_id: routePubs.find(p => p.is_primary)?.publication_id || null,
        stop_order: currentStop.stop_order ?? 0,
        expected_qty: expected,
        delivered_qty: expected, // assume full delivery; can edit later via Phase 7 polish
        status: "delivered",
        notes: confirmingNotes.trim() || null,
        gps_lat: gps.lat ?? null,
        gps_lng: gps.lng ?? null,
        gps_accuracy_m: gps.accuracy ? Math.min(99999, Math.round(gps.accuracy * 100) / 100) : null,
        confirmed_at: new Date().toISOString(),
      }).select().single();
      if (cErr) throw cErr;
      setConfirms(prev => [...prev, conf]);
      setConfirmingNotes("");
      // Auto-advance.
      setTimeout(() => advance(), 250);
    } catch (e) {
      alert("Confirm failed: " + String(e?.message ?? e));
    } finally {
      setConfirming(false);
    }
  };

  const onSkip = async ({ reason, notes, escalate }) => {
    if (!currentStop) return;
    try {
      const { data: conf, error: cErr } = await supabase.from("stop_confirmations").insert({
        route_instance_id: instance.id,
        drop_location_id: currentStop.drop_location_id,
        publication_id: routePubs.find(p => p.is_primary)?.publication_id || null,
        stop_order: currentStop.stop_order ?? 0,
        expected_qty: currentStop.expected_qty || 0,
        delivered_qty: null,
        status: "skipped",
        skip_reason: reason,
        notes: notes || null,
        gps_lat: gps.lat ?? null,
        gps_lng: gps.lng ?? null,
        gps_accuracy_m: gps.accuracy ? Math.min(99999, Math.round(gps.accuracy * 100) / 100) : null,
        confirmed_at: new Date().toISOString(),
      }).select().single();
      if (cErr) throw cErr;
      setConfirms(prev => [...prev, conf]);
      setSkipOpen(false);
      setConfirmingNotes("");
      // TODO Phase 7 polish: if escalate, INSERT service_tickets row
      // assigned to Cami so the office sees the operational issue.
      setTimeout(() => advance(), 250);
    } catch (e) {
      alert("Skip failed: " + String(e?.message ?? e));
    }
  };

  const advance = () => {
    if (currentIdx < totalStops - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      // All stops processed — move to Complete screen.
      onComplete?.(instance.id);
    }
  };

  const navigateExternal = () => {
    if (!currentLoc?.lat || !currentLoc?.lng) return;
    // Apple Maps URL works on iOS; Android falls back via maps.google.com. The geo: scheme
    // would also work but iOS doesn't honor it without entitlements.
    const url = `https://maps.apple.com/?daddr=${currentLoc.lat},${currentLoc.lng}`;
    window.open(url, "_blank");
  };

  // ── Render guards ────────────────────────────────────────────
  if (loading) {
    return <FullScreen><Centered>Loading route…</Centered></FullScreen>;
  }
  if (error) {
    return <FullScreen><Centered>
      <div style={{ color: RED, marginBottom: 12 }}>{error}</div>
      <button onClick={onBack} style={btnGhost}>← Back to Today</button>
    </Centered></FullScreen>;
  }
  if (!currentStop || !currentLoc) {
    return <FullScreen><Centered>
      <div style={{ marginBottom: 12 }}>Route has no stops.</div>
      <button onClick={onBack} style={btnGhost}>← Back to Today</button>
    </Centered></FullScreen>;
  }

  // ── Main render ──────────────────────────────────────────────
  return <div style={{
    minHeight: "100vh", background: BG, color: TEXT,
    display: "flex", flexDirection: "column",
    paddingBottom: 76, // leave room for sticky bottom nav
  }}>
    {/* Header — back, counter, progress chip */}
    <div style={{
      position: "sticky", top: 0, zIndex: 10, background: BG,
      padding: "12px 16px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      borderBottom: `1px solid ${PANEL_BD}`,
    }}>
      <button onClick={onBack} style={{
        background: "transparent", border: "none", color: MUTED, fontSize: 22,
        cursor: "pointer", padding: 4, lineHeight: 1,
      }}>‹</button>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Stop {currentIdx + 1} of {totalStops}</div>
        <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {completedCount} done · {skippedCount} skip · {totalStops - completedCount - skippedCount} left
        </div>
      </div>
      <div style={{ width: 30 }} />
    </div>

    {/* Map zone */}
    <RouteMap
      stops={mapStops}
      currentLat={gps.lat}
      currentLng={gps.lng}
      currentStopId={currentStop.id}
      onPinTap={(stopId) => {
        const idx = orderedStops.findIndex(s => s.id === stopId);
        if (idx >= 0) setCurrentIdx(idx);
      }}
      height={220}
    />

    {/* Stop info card */}
    <div style={{ padding: "16px 16px 0", flex: 1 }}>
      <div style={{
        background: PANEL_BG, borderRadius: 14,
        padding: 16, border: `1px solid ${PANEL_BD}`,
      }}>
        {/* Stop name + address + Navigate */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 4 }}>{currentLoc.name}</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.4 }}>
              {currentLoc.address}
              {currentLoc.city && `, ${currentLoc.city}`}
              {currentLoc.zip && ` ${currentLoc.zip}`}
            </div>
          </div>
          <button onClick={navigateExternal} style={{
            background: "transparent", color: GOLD, border: `1px solid ${GOLD}`,
            padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: "pointer", minHeight: 48, whiteSpace: "nowrap",
          }}>Navigate ↗</button>
        </div>

        {/* Per-pub qty rows */}
        {currentLocPubs.length > 0 && <div style={{ marginBottom: 12 }}>
          {currentLocPubs.map(p => {
            const pub = pubsById.get(p.publication_id);
            // Drop "The " prefix + " Magazine"/"News" suffix for compact display.
            const fullName = pub?.name || p.publication_id;
            const label = fullName.replace(/^The /, "").replace(/ (Magazine|News)$/, " $1");
            return <div key={p.publication_id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0",
              borderBottom: `1px solid ${PANEL_BD}`,
            }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>📦 {label}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>× {p.quantity}</span>
            </div>;
          })}
        </div>}

        {/* Location notes (driver-managed; per spec these are visible to driver) */}
        {currentLoc.notes && <div style={{
          padding: "10px 12px", background: GOLD + "15", borderLeft: `3px solid ${GOLD}`,
          borderRadius: 6, fontSize: 14, color: TEXT, lineHeight: 1.4, marginBottom: 12,
        }}>💡 {currentLoc.notes}</div>}

        {/* Primary action — confirm. Sits above the per-stop note so
            the most-pressed control is in thumb reach the moment the
            quantities and address have been read. */}
        <button
          onClick={onConfirmDelivery}
          disabled={confirming}
          style={{
            width: "100%", padding: "16px", minHeight: 56, boxSizing: "border-box",
            background: confirming ? PANEL_BD : GOLD,
            color: confirming ? MUTED : "#0F1419",
            border: "none", borderRadius: 12,
            fontSize: 17, fontWeight: 900, letterSpacing: 0.3,
            cursor: confirming ? "not-allowed" : "pointer",
            marginBottom: 12,
          }}
        >{confirming ? "Saving…" : "✓ CONFIRM DELIVERY"}</button>

        {/* Per-instance note input (for THIS confirmation only) */}
        <textarea
          value={confirmingNotes}
          onChange={e => setConfirmingNotes(e.target.value)}
          placeholder="Add a note for this stop (optional)…"
          rows={2}
          style={{
            width: "100%", padding: "10px 12px", boxSizing: "border-box",
            background: BG, color: TEXT,
            border: `1px solid ${PANEL_BD}`, borderRadius: 8,
            fontSize: 16, fontFamily: "inherit", resize: "vertical",
            marginBottom: 12,
          }}
        />

        {/* Photo button (Phase 7 follow-up will wire) */}
        <button disabled style={{
          width: "100%", padding: "12px", boxSizing: "border-box",
          background: "transparent", color: MUTED,
          border: `1px dashed ${PANEL_BD}`, borderRadius: 8,
          fontSize: 13, cursor: "not-allowed",
          marginBottom: 16,
        }}>📷 Add photo (coming next)</button>

        {/* GPS status indicator */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, color: gps.status === "ok" ? GREEN : RED,
          fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
          marginBottom: 12,
        }}>
          <span>{gps.status === "ok" ? "● GPS active" : `● GPS ${gps.status}`}</span>
          {gps.accuracy && gps.status === "ok" && <span style={{ color: MUTED, fontWeight: 400 }}>· ±{Math.round(gps.accuracy)}m</span>}
        </div>

        {/* Secondary — skip */}
        <button onClick={() => setSkipOpen(true)} style={{
          width: "100%", padding: "10px",
          background: "transparent", color: RED,
          border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>Skip this stop</button>
      </div>
    </div>

    {/* Sticky bottom nav */}
    <BottomNav
      onMessage={() => alert("Message: Phase 9 wiring")}
      onAddStop={() => alert("Add Stop: Phase 8 wiring")}
      onMore={() => alert("More menu: Complete Route, All Stops, Sign Out — Phase 7 polish")}
    />

    <SkipReasonSheet
      open={skipOpen}
      onSubmit={onSkip}
      onCancel={() => setSkipOpen(false)}
    />
  </div>;
}

// ── Bottom nav (3 buttons per Andrew's Q8) ──────────────────────
function BottomNav({ onMessage, onAddStop, onMore, unread = 0 }) {
  return <div style={{
    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
    background: PANEL_BG, borderTop: `1px solid ${PANEL_BD}`,
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
    paddingBottom: "env(safe-area-inset-bottom)",
  }}>
    <NavBtn icon="💬" label="Message" badge={unread} onClick={onMessage} />
    <NavBtn icon="➕" label="Add stop" onClick={onAddStop} />
    <NavBtn icon="☰" label="More" onClick={onMore} />
  </div>;
}

function NavBtn({ icon, label, badge, onClick }) {
  return <button onClick={onClick} style={{
    background: "transparent", color: TEXT, border: "none",
    padding: "12px 8px", minHeight: 60, cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
    position: "relative",
  }}>
    <span style={{ fontSize: 20 }}>{icon}</span>
    <span style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>{label}</span>
    {badge > 0 && <span style={{
      position: "absolute", top: 6, right: "30%",
      background: RED, color: "#fff", fontSize: 10, fontWeight: 800,
      padding: "2px 5px", borderRadius: 8, minWidth: 16, textAlign: "center",
    }}>{badge}</span>}
  </button>;
}

// ── Layout primitives ──────────────────────────────────────────
function FullScreen({ children }) {
  return <div style={{ minHeight: "100vh", background: BG, color: TEXT }}>{children}</div>;
}
function Centered({ children }) {
  return <div style={{
    minHeight: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: 32, color: MUTED, fontSize: 14, textAlign: "center", gap: 12,
  }}>{children}</div>;
}
const btnGhost = {
  background: "transparent", border: `1px solid ${PANEL_BD}`, color: MUTED,
  padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14,
};
