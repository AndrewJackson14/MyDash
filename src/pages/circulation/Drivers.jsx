// Drivers tab — roster + add/edit modal (spec v1.1 §5.5).
//
// flat_fee is gone from the drivers table (migration 130) — pay comes
// from the route template (migration 129 trigger pulls from
// driver_routes.flat_fee). Cards now show SMS consent status + routes
// count + last run instead of the old per-driver fee.
//
// 'Send Magic Link' stub remains; Phase 6 will wire it to the
// driver-auth Edge Function once Twilio verification clears.
import { useState } from "react";
import { Z, COND, FS, FW, R, Ri } from "../../lib/theme";
import { Ic, Btn, Inp, TA, Modal, GlassCard, GlassStat } from "../../components/ui";
import { supabase, EDGE_FN_URL } from "../../lib/supabase";
import { fmtDate } from "../../lib/formatters";

export default function Drivers({
  drivers, setDrivers,
  driverRoutes,
}) {
  const drvs = drivers || [];
  const routes = driverRoutes || [];

  const [driverModal, setDriverModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null); // null = create; obj = edit
  const blankDriver = { name: "", sms_phone: "", email: "", sms_consent: false, notes: "", is_active: true };
  const [driverForm, setDriverForm] = useState(blankDriver);
  const [saving, setSaving] = useState(false);

  const openNewDriver = () => {
    setEditingDriver(null);
    setDriverForm({ ...blankDriver });
    setDriverModal(true);
  };
  const openEditDriver = (d) => {
    setEditingDriver(d);
    setDriverForm({
      name: d.name || "",
      sms_phone: d.sms_phone || d.phone || "",
      email: d.email || "",
      sms_consent: !!d.sms_consent_at,
      notes: d.notes || "",
      is_active: d.isActive !== false,
    });
    setDriverModal(true);
  };
  const closeDriverModal = () => {
    setDriverModal(false);
    setEditingDriver(null);
    setDriverForm({ ...blankDriver });
  };

  // ── Persist to Supabase ──────────────────────────────────────────
  // Mirrors the Routes.jsx Edit/Create branch pattern. Same handler
  // covers both — editingDriver presence is the branch.
  const saveDriver = async () => {
    if (!driverForm.name || saving) return;
    setSaving(true);
    const isEdit = !!editingDriver;

    // sms_consent toggle controls the timestamp:
    //   was off, now on  → stamp now()
    //   was on,  now off → null it (revoke)
    //   unchanged        → preserve existing timestamp
    const wasConsented = !!editingDriver?.sms_consent_at;
    const consentTs = driverForm.sms_consent
      ? (wasConsented ? editingDriver.sms_consent_at : new Date().toISOString())
      : null;

    const payload = {
      name: driverForm.name,
      sms_phone: driverForm.sms_phone || null,
      phone: driverForm.sms_phone || null, // mirror to legacy phone column for now
      email: driverForm.email || null,
      sms_consent_at: consentTs,
      notes: driverForm.notes || null,
      is_active: driverForm.is_active !== false,
    };

    if (isEdit) {
      const { data, error } = await supabase.from("drivers")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingDriver.id).select().single();
      setSaving(false);
      if (error) { console.error("Driver update failed:", error); return; }
      setDrivers(prev => (prev || []).map(d => d.id === data.id ? {
        ...d,
        name: data.name,
        sms_phone: data.sms_phone,
        phone: data.phone,
        email: data.email,
        sms_consent_at: data.sms_consent_at,
        notes: data.notes,
        isActive: data.is_active,
      } : d));
    } else {
      const { data, error } = await supabase.from("drivers").insert(payload).select().single();
      setSaving(false);
      if (error) { console.error("Driver insert failed:", error); return; }
      setDrivers(prev => [...(prev || []), {
        id: data.id,
        name: data.name,
        sms_phone: data.sms_phone,
        phone: data.phone,
        email: data.email,
        sms_consent_at: data.sms_consent_at,
        notes: data.notes,
        isActive: data.is_active,
        createdAt: data.created_at,
      }]);
    }
    closeDriverModal();
  };

  // Send Magic Link: call driver-auth issue, show the PIN to Cami in
  // a modal so she can read it manually if SMS doesn't land. Twilio
  // dispatch happens server-side and reports back via sms_sent flag.
  const [linkResult, setLinkResult] = useState(null);
  const [sendingLinkFor, setSendingLinkFor] = useState(null);

  const sendMagicLink = async (driver) => {
    setSendingLinkFor(driver.id);
    setLinkResult(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Sign in required");
      const res = await fetch(`${EDGE_FN_URL}/driver-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: supabase.supabaseKey || "" },
        body: JSON.stringify({ action: "issue", driver_id: driver.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to issue link");
      setLinkResult({ driver, ...json });
    } catch (e) {
      setLinkResult({ driver, error: String(e?.message ?? e) });
    } finally {
      setSendingLinkFor(null);
    }
  };

  const daysSince = (iso) => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    const d = Math.floor(ms / 86400000);
    if (d === 0) return "today";
    if (d === 1) return "1 day ago";
    if (d < 30) return `${d} days ago`;
    return fmtDate(iso.slice(0, 10));
  };

  return <>
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <Btn sm onClick={openNewDriver}><Ic.plus size={13} /> New Driver</Btn>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      <GlassStat label="Active Drivers" value={drvs.filter(d => d.isActive).length} />
      <GlassStat label="Assigned Routes" value={routes.filter(r => r.driverId || r.defaultDriverId).length} />
      <GlassStat label="SMS Consent on File" value={drvs.filter(d => d.isActive && d.sms_consent_at).length} />
    </div>

    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Drivers</div>
      {drvs.length === 0
        ? <div style={{ fontSize: FS.base, color: Z.td, padding: "8px 0" }}>No drivers yet</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drvs.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(d => {
              const dRoutes = routes.filter(r => (r.driverId || r.defaultDriverId) === d.id);
              const hasConsent = !!d.sms_consent_at;
              const lastRun = daysSince(d.last_route_completed_at);
              const isInactive = d.isActive === false;
              return <div key={d.id} style={{
                display: "grid", gridTemplateColumns: "1fr 140px 90px 1fr 70px 130px",
                gap: 10, alignItems: "center", padding: "8px 10px",
                background: Z.bg, borderRadius: R,
                opacity: isInactive ? 0.55 : 1,
              }}>
                <div>
                  <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>
                    {d.name}
                    {isInactive && <span style={{
                      fontSize: FS.micro, fontWeight: FW.heavy, color: Z.da,
                      background: Z.da + "18", padding: "2px 6px", borderRadius: Ri,
                      marginLeft: 8, textTransform: "uppercase", letterSpacing: 0.5,
                    }}>Inactive</span>}
                  </div>
                  {(d.sms_phone || d.phone) && <div style={{ fontSize: FS.xs, color: Z.td }}>{d.sms_phone || d.phone}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{
                    fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND,
                    color: hasConsent ? Z.go : Z.da,
                    textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    {hasConsent ? "✓ SMS consent" : "No SMS consent"}
                  </div>
                  {hasConsent && <div style={{ fontSize: FS.micro, color: Z.td }}>{fmtDate(d.sms_consent_at.slice(0, 10))}</div>}
                </div>
                <div style={{ fontSize: FS.sm, color: Z.tm, textAlign: "right" }}>{dRoutes.length} route{dRoutes.length !== 1 ? "s" : ""}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>Last run</div>
                  <div style={{ fontSize: FS.sm, color: lastRun ? Z.tx : Z.td, fontWeight: lastRun ? FW.semi : 400 }}>{lastRun || "No runs yet"}</div>
                </div>
                <Btn sm v="ghost" onClick={() => openEditDriver(d)}>Edit</Btn>
                <div style={{ textAlign: "right" }}>
                  <Btn sm v="secondary"
                    onClick={() => sendMagicLink(d)}
                    disabled={isInactive || !(d.sms_phone || d.phone) || sendingLinkFor === d.id}
                  >{sendingLinkFor === d.id ? "Sending…" : "Send Magic Link"}</Btn>
                </div>
              </div>;
            })}
          </div>}
    </GlassCard>

    {/* Magic-link result modal — shows PIN to Cami so she can read it
        to the driver if SMS lags or fails. PIN is also returned by
        the Edge Function regardless of SMS outcome. */}
    {linkResult && <Modal open={true} onClose={() => setLinkResult(null)}
      title={linkResult.error ? "Magic Link Failed" : `Magic Link for ${linkResult.driver.name}`}
      width={460}
    >
      {linkResult.error
        ? <div style={{ padding: "10px 14px", background: Z.da + "18", color: Z.da, borderRadius: Ri, fontSize: FS.sm }}>
            {linkResult.error}
          </div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: "16px 18px", background: Z.bg, borderRadius: Ri, textAlign: "center" }}>
              <div style={{ fontSize: FS.xs, color: Z.td, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                6-digit PIN
              </div>
              <div style={{ fontSize: 36, fontWeight: FW.black, color: Z.ac, letterSpacing: 6, fontFamily: "monospace" }}>
                {linkResult.pin}
              </div>
            </div>
            <div style={{ fontSize: FS.sm, color: Z.tx, lineHeight: 1.5 }}>
              {linkResult.sms_sent
                ? <span style={{ color: Z.go, fontWeight: FW.bold }}>✓ SMS sent to {linkResult.driver.sms_phone || linkResult.driver.phone}</span>
                : <>
                    <span style={{ color: Z.wa, fontWeight: FW.bold }}>SMS not sent</span>{" "}
                    <span style={{ color: Z.tm }}>({linkResult.reason || "unknown"})</span>
                    <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 4 }}>
                      Read the PIN and link to the driver by phone, or have them tap the link below directly.
                    </div>
                  </>}
            </div>
            <div>
              <div style={{ fontSize: FS.micro, color: Z.td, fontWeight: FW.heavy, textTransform: "uppercase", marginBottom: 4 }}>
                Magic link
              </div>
              <div style={{
                padding: "8px 10px", background: Z.bg, borderRadius: Ri,
                fontSize: FS.xs, color: Z.tx, fontFamily: "monospace",
                wordBreak: "break-all",
              }}>{linkResult.magic_link}</div>
              <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 4 }}>
                Expires {new Date(linkResult.expires_at).toLocaleString()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn v="secondary" onClick={() => navigator.clipboard?.writeText(linkResult.magic_link)}>Copy link</Btn>
              <Btn onClick={() => setLinkResult(null)}>Close</Btn>
            </div>
          </div>}
    </Modal>}

    <Modal open={driverModal} onClose={closeDriverModal}
      title={editingDriver ? `Edit Driver — ${editingDriver.name}` : "New Driver"}
      width={460} onSubmit={saveDriver}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Name" value={driverForm.name} onChange={e => setDriverForm(f => ({ ...f, name: e.target.value }))} />
        <Inp label="SMS Phone (E.164)" value={driverForm.sms_phone} onChange={e => setDriverForm(f => ({ ...f, sms_phone: e.target.value }))} placeholder="+18055551234" />
        <Inp label="Email" type="email" value={driverForm.email} onChange={e => setDriverForm(f => ({ ...f, email: e.target.value }))} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.sm, color: Z.tx, cursor: "pointer" }}>
          <input type="checkbox" checked={driverForm.sms_consent}
            onChange={e => setDriverForm(f => ({ ...f, sms_consent: e.target.checked }))} />
          <span>Driver has consented to SMS notifications (A2P / toll-free 10DLC compliance)</span>
        </label>
        <TA label="Notes" value={driverForm.notes} onChange={e => setDriverForm(f => ({ ...f, notes: e.target.value }))} rows={2} />

        {editingDriver && <label style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", background: driverForm.is_active ? Z.go + "12" : Z.da + "12",
          borderRadius: Ri, fontSize: FS.sm, cursor: "pointer",
        }}>
          <input type="checkbox" checked={driverForm.is_active !== false}
            onChange={e => setDriverForm(f => ({ ...f, is_active: e.target.checked }))} />
          <span style={{ color: Z.tx, fontWeight: FW.semi }}>
            {driverForm.is_active !== false ? "Active" : "Deactivated"} —
            <span style={{ color: Z.tm, fontWeight: 400 }}> {driverForm.is_active !== false
              ? "appears in route assignment + can receive magic links"
              : "hidden from route picker; existing routes keep this driver until reassigned"}</span>
          </span>
        </label>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={closeDriverModal}>Cancel</Btn>
          <Btn onClick={saveDriver} disabled={!driverForm.name || saving}>
            {saving ? "Saving…" : editingDriver ? "Save Changes" : "Add Driver"}
          </Btn>
        </div>
      </div>
    </Modal>
  </>;
}
