// Drivers tab — roster + add-driver modal (spec v1.1 §5.5).
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
import { fmtDate } from "../../lib/formatters";

export default function Drivers({
  drivers, setDrivers,
  driverRoutes,
}) {
  const drvs = drivers || [];
  const routes = driverRoutes || [];

  const [driverModal, setDriverModal] = useState(false);
  const blankDriver = { name: "", sms_phone: "", email: "", sms_consent: false, notes: "" };
  const [driverForm, setDriverForm] = useState(blankDriver);

  const saveDriver = () => {
    if (!driverForm.name) return;
    setDrivers(prev => [...(prev || []), {
      ...driverForm,
      id: "drv-" + Date.now(),
      isActive: true,
      sms_consent_at: driverForm.sms_consent ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    }]);
    setDriverModal(false);
    setDriverForm({ ...blankDriver });
  };

  const sendMagicLink = async (driver) => {
    alert(`Send Magic Link: Phase 6 wiring.\nDriver: ${driver.name}\nPhone: ${driver.sms_phone || driver.phone || "(no phone on file)"}`);
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
      <Btn sm onClick={() => setDriverModal(true)}><Ic.plus size={13} /> New Driver</Btn>
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
            {drvs.map(d => {
              const dRoutes = routes.filter(r => (r.driverId || r.defaultDriverId) === d.id);
              const hasConsent = !!d.sms_consent_at;
              const lastRun = daysSince(d.last_route_completed_at);
              return <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px 90px 1fr 130px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.bg, borderRadius: R }}>
                <div>
                  <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{d.name}</div>
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
                <div style={{ textAlign: "right" }}>
                  <Btn sm v="secondary" onClick={() => sendMagicLink(d)} disabled={!(d.sms_phone || d.phone)}>Send Magic Link</Btn>
                </div>
              </div>;
            })}
          </div>}
    </GlassCard>

    <Modal open={driverModal} onClose={() => setDriverModal(false)} title="New Driver" width={460} onSubmit={saveDriver}>
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
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setDriverModal(false)}>Cancel</Btn>
          <Btn onClick={saveDriver} disabled={!driverForm.name}>Add Driver</Btn>
        </div>
      </div>
    </Modal>
  </>;
}
