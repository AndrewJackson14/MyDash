// Drivers tab — roster + add-driver modal. Per spec v1.1 §5.5:
// - SMS phone field (E.164 auto-format wiring lands in Phase 6)
// - 'Send Magic Link' button per card (stubbed; wires up in Phase 6)
// Existing roster behavior is preserved.
import { useState } from "react";
import { Z, FS, FW, R, Ri } from "../../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Modal, GlassCard, GlassStat } from "../../components/ui";
import { fmtCurrency } from "../../lib/formatters";

export default function Drivers({
  drivers, setDrivers,
  driverRoutes,
}) {
  const drvs = drivers || [];
  const routes = driverRoutes || [];

  const [driverModal, setDriverModal] = useState(false);
  const blankDriver = { name: "", phone: "", sms_phone: "", email: "", flatFee: 0, notes: "" };
  const [driverForm, setDriverForm] = useState(blankDriver);

  const saveDriver = () => {
    if (!driverForm.name) return;
    setDrivers(prev => [...(prev || []), {
      ...driverForm,
      id: "drv-" + Date.now(),
      isActive: true,
      createdAt: new Date().toISOString(),
    }]);
    setDriverModal(false);
    setDriverForm({ ...blankDriver });
  };

  // Phase 6 will replace this stub with a call to the driver-auth
  // Edge Function + Twilio SMS dispatch.
  const sendMagicLink = async (driver) => {
    alert(`Send Magic Link: Phase 6 wiring.\nDriver: ${driver.name}\nPhone: ${driver.sms_phone || driver.phone || "(no phone on file)"}`);
  };

  return <>
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <Btn sm onClick={() => setDriverModal(true)}><Ic.plus size={13} /> New Driver</Btn>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      <GlassStat label="Active Drivers" value={drvs.filter(d => d.isActive).length} />
      <GlassStat label="Assigned Routes" value={routes.filter(r => r.driverId).length} />
      <GlassStat label="Weekly Driver Cost" value={fmtCurrency(drvs.filter(d => d.isActive).reduce((s, d) => s + (d.flatFee || 0), 0))} />
    </div>

    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Drivers</div>
      {drvs.length === 0
        ? <div style={{ fontSize: FS.base, color: Z.td, padding: "8px 0" }}>No drivers yet</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drvs.map(d => {
              const dRoutes = routes.filter(r => r.driverId === d.id);
              return <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px 80px 1fr 120px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.bg, borderRadius: R }}>
                <div>
                  <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{d.name}</div>
                  {(d.sms_phone || d.phone) && <div style={{ fontSize: FS.xs, color: Z.td }}>{d.sms_phone || d.phone}</div>}
                </div>
                <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.su, textAlign: "right" }}>{fmtCurrency(d.flatFee)}/route</div>
                <div style={{ fontSize: FS.sm, color: Z.tm, textAlign: "right" }}>{dRoutes.length} route{dRoutes.length !== 1 ? "s" : ""}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {dRoutes.map(r => <span key={r.id} style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.ac, background: Z.as, borderRadius: Ri, padding: "2px 8px" }}>{r.name}</span>)}
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="SMS Phone (E.164)" value={driverForm.sms_phone} onChange={e => setDriverForm(f => ({ ...f, sms_phone: e.target.value }))} placeholder="+18055551234" />
          <Inp label="Flat Fee per Route" type="number" step="0.01" value={driverForm.flatFee || ""} onChange={e => setDriverForm(f => ({ ...f, flatFee: Number(e.target.value) || 0 }))} />
        </div>
        <Inp label="Email" type="email" value={driverForm.email} onChange={e => setDriverForm(f => ({ ...f, email: e.target.value }))} />
        <TA label="Notes" value={driverForm.notes} onChange={e => setDriverForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setDriverModal(false)}>Cancel</Btn>
          <Btn onClick={saveDriver} disabled={!driverForm.name}>Add Driver</Btn>
        </div>
      </div>
    </Modal>
  </>;
}
