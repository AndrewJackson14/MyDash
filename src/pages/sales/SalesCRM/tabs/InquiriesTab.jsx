import { Z, COND, FS, FW, Ri, R, CARD } from "../../../../lib/theme";
import { Btn, EmptyState, GlassStat, cardSurface } from "../../../../components/ui";
import { COMPANY } from "../../../../constants";

// Inquiries tab — website Advertise-page form submissions land here as
// "new" rows. SLA badge surfaces aging (audit I-2: <30m fresh, <2h yellow,
// >2h red) so reps can see hot leads dying in queue. Sort pins "new" by
// age (oldest first) above the rest.
//
// Wave 2: extracted as-is from SalesCRM monolith. The "Reply" CTA still
// opens the global email modal — passed in via openEmailModal; the parent
// owns that modal (it's shared with sale cards + client header).
export default function InquiriesTab({
  adInquiries,
  inquiriesLoaded,
  clients,
  team,
  adProductMap,
  currentUser,
  updateInquiry,
  insertClient,
  insertSale,
  setTab,
  navTo,
  openEmailModal,
}) {
  const inquiries = adInquiries || [];
  const newCount = inquiries.filter(i => i.status === "new").length;
  const contactedCount = inquiries.filter(i => i.status === "contacted").length;
  const convertedCount = inquiries.filter(i => i.status === "converted").length;
  const statusColors = {
    new: Z.ac || "var(--action)",
    contacted: Z.wa || "#f59e0b",
    converted: Z.su || "#22c55e",
    dismissed: Z.tm || "#9ca3af",
  };

  const confidenceBadge = (conf, reason) => {
    if (conf === "none") return null;
    const color = conf === "exact" ? (Z.su || "#22c55e") : (Z.wa || "#f59e0b");
    return (
      <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: color + "18", color, fontFamily: COND, textTransform: "uppercase" }}>
        {conf} — {reason}
      </span>
    );
  };

  // SLA aging — only meaningful while still "new". Hot leads die in queue.
  const slaBadge = (inq) => {
    if (inq.status !== "new") return null;
    const ageMin = (Date.now() - new Date(inq.created_at).getTime()) / 60000;
    let color, label;
    if (ageMin < 30) { color = Z.su || "#22c55e"; label = "FRESH"; }
    else if (ageMin < 120) { color = Z.wa || "#f59e0b"; label = `${Math.round(ageMin)}m`; }
    else if (ageMin < 1440) { color = Z.da || "#ef4444"; label = `${Math.round(ageMin / 60)}h LATE`; }
    else { color = Z.da || "#ef4444"; label = `${Math.round(ageMin / 1440)}d LATE`; }
    return (
      <span title={`Inquiry age — respond within 30 min for best conversion. Created ${new Date(inq.created_at).toLocaleString()}`} style={{ fontSize: FS.micro, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: color + "22", color, fontFamily: COND, letterSpacing: 0.5 }}>● {label}</span>
    );
  };

  // Sort: new inquiries by age (oldest first — they're the most at risk),
  // then everything else by created_at desc.
  const sortedInquiries = [...inquiries].sort((a, b) => {
    const aNew = a.status === "new" ? 0 : 1;
    const bNew = b.status === "new" ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    if (a.status === "new") return new Date(a.created_at) - new Date(b.created_at);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12 }}>
        <GlassStat label="New" value={newCount} color={statusColors.new} />
        <GlassStat label="Contacted" value={contactedCount} color={statusColors.contacted} />
        <GlassStat label="Signed" value={convertedCount} color={statusColors.converted} />
        <GlassStat label="Total" value={inquiries.length} />
      </div>

      {/* Inquiry list */}
      {!inquiriesLoaded ? (
        <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: FS.sm, fontFamily: COND }}>Loading inquiries...</div>
      ) : inquiries.length === 0 ? (
        <EmptyState
          icon="📨"
          title="No new inquiries"
          body="Submissions from your website's Advertise page land here. We'll surface a notification on the Pipeline tab when one arrives."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sortedInquiries.map(inq => {
            const matchedClient = inq.client_id ? (clients || []).find(c => c.id === inq.client_id) : null;
            const rep = matchedClient?.repId ? (team || []).find(t => t.id === matchedClient.repId) : null;
            return (
              <div key={inq.id} style={{ ...cardSurface(), padding: CARD.pad, borderRadius: R, border: "1px solid " + Z.bd, display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{inq.business_name || inq.name}</span>
                      <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: (statusColors[inq.status] || Z.tm) + "18", color: statusColors[inq.status] || Z.tm, fontFamily: COND, textTransform: "uppercase" }}>{inq.status}</span>
                      {slaBadge(inq)}
                      {confidenceBadge(inq.match_confidence, inq.match_reason)}
                      {matchedClient && !inq.confirmed && inq.match_confidence !== "none" && (
                        <span style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => updateInquiry(inq.id, { confirmed: true })} style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: (Z.su || "#22c55e") + "18", color: Z.su || "#22c55e", border: "none", cursor: "pointer", fontFamily: COND }}>Confirm Match</button>
                          <button onClick={() => updateInquiry(inq.id, { client_id: null, match_confidence: "none", match_reason: "" })} style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: (Z.da || "#ef4444") + "18", color: Z.da || "#ef4444", border: "none", cursor: "pointer", fontFamily: COND }}>Reject</button>
                        </span>
                      )}
                      {inq.confirmed && <span style={{ fontSize: FS.micro, fontWeight: 700, color: Z.su || "#22c55e", fontFamily: COND }}>&#10003; Confirmed</span>}
                    </div>
                    <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                      {inq.name} &middot; {inq.email}{inq.phone ? " · " + inq.phone : ""}{inq.website ? " · " + inq.website : ""}
                    </div>
                    {matchedClient && <div style={{ fontSize: FS.xs, color: Z.ac, fontFamily: COND, marginTop: 2, cursor: "pointer" }} onClick={() => navTo("Clients", matchedClient.id)}>Linked to: {matchedClient.name}{rep ? " (Rep: " + rep.name + ")" : ""}</div>}
                  </div>
                  <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, whiteSpace: "nowrap" }}>
                    {new Date(inq.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>

                {/* Details row */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: FS.sm, color: Z.tx, fontFamily: COND }}>
                  {inq.ad_types?.length > 0 && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Types:</span> {inq.ad_types.join(", ")}</div>}
                  {inq.preferred_zones?.length > 0 && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Zones:</span> {inq.preferred_zones.join(", ")}</div>}
                  {inq.interested_product_ids?.length > 0 && (
                    <div title={inq.interested_product_ids.map(id => adProductMap[id] || id).join(", ")}>
                      <span style={{ color: Z.tm, fontWeight: 600 }}>Products:</span>{" "}
                      {inq.interested_product_ids.map(id => adProductMap[id]).filter(Boolean).join(", ") || `${inq.interested_product_ids.length} selected`}
                    </div>
                  )}
                  {inq.budget_range && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Budget:</span> {inq.budget_range}</div>}
                  {inq.desired_start && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Start:</span> {new Date(inq.desired_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>}
                  {inq.how_heard && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Source:</span> {inq.how_heard}</div>}
                </div>

                {inq.message && <div style={{ fontSize: FS.sm, color: Z.tx, fontFamily: COND, background: Z.sa, padding: "6px 10px", borderRadius: Ri, borderLeft: "3px solid " + Z.bd }}>{inq.message}</div>}

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  {inq.email && (
                    <Btn sm v="primary" onClick={() => {
                      openEmailModal({
                        to: inq.email,
                        subject: `Re: Your inquiry about advertising with 13 Stars Media`,
                        body: `Hi ${inq.name || ""},\n\nThanks for reaching out about advertising with 13 Stars Media. ${inq.message ? `\n\nYou wrote:\n> ${inq.message.split("\n").join("\n> ")}\n` : ""}\nI'd love to set up a quick call to learn more about your business and recommend the right fit. What works for you this week?\n\nBest,\n${COMPANY?.sales?.name || ""}\n${COMPANY?.sales?.phone || ""}`,
                      });
                      if (inq.status === "new") updateInquiry(inq.id, { status: "contacted", updated_at: new Date().toISOString() });
                    }}>Reply</Btn>
                  )}
                  {inq.status === "new" && <Btn sm onClick={() => updateInquiry(inq.id, { status: "contacted", updated_at: new Date().toISOString() })}>Mark Contacted</Btn>}
                  {(inq.status === "new" || inq.status === "contacted") && !inq.converted_sale_id && (
                    <Btn sm v="primary" onClick={async () => {
                      // Convert to Draft Sale: ensure client, create a Discovery sale
                      // pre-filled from inquiry data, link inquiry -> sale, jump to
                      // pipeline so the rep sees it.
                      let clientId = inq.client_id;
                      if (!clientId) {
                        const nc = await insertClient({
                          name: inq.business_name || inq.name,
                          status: "Lead",
                          leadSource: "Website Inquiry",
                          contacts: [{ name: inq.name, email: inq.email, phone: inq.phone || "", role: "Business Owner" }],
                          notes: "From ad inquiry: " + (inq.message || ""),
                          repId: currentUser?.id || null,
                        });
                        clientId = nc?.id;
                        if (!clientId) return;
                      }
                      const startDate = inq.desired_start || new Date().toISOString().slice(0, 10);
                      const newSale = await insertSale({
                        clientId,
                        publication: inq.site_id || null,
                        productType: "web_ad",
                        date: startDate,
                        status: "Discovery",
                        assignedTo: currentUser?.id || null,
                        flightStartDate: inq.desired_start || null,
                        oppNotes: inq.message ? [{ text: inq.message, time: inq.created_at, source: "inquiry" }] : [],
                      });
                      if (newSale?.id) {
                        await updateInquiry(inq.id, {
                          status: "contacted",
                          client_id: clientId,
                          converted_sale_id: newSale.id,
                          converted_by: currentUser?.id || null,
                          converted_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                        });
                        setTab("Pipeline");
                      }
                    }}>Create Draft Sale</Btn>
                  )}
                  {(inq.status === "new" || inq.status === "contacted") && inq.converted_sale_id && (
                    <Btn sm v="ghost" onClick={() => setTab("Pipeline")}>View Sale &rarr;</Btn>
                  )}
                  {(inq.status === "new" || inq.status === "contacted") && (
                    <Btn sm v="success" onClick={() => {
                      if (!inq.client_id) {
                        const newClient = {
                          name: inq.business_name || inq.name,
                          status: "Lead",
                          leadSource: "Website Inquiry",
                          contacts: [{ name: inq.name, email: inq.email, phone: inq.phone || "", role: "Business Owner" }],
                          notes: "From ad inquiry: " + (inq.message || ""),
                          repId: currentUser?.id || null,
                        };
                        insertClient(newClient).then(nc => {
                          if (nc?.id) updateInquiry(inq.id, { status: "converted", client_id: nc.id, updated_at: new Date().toISOString() });
                        });
                      } else {
                        updateInquiry(inq.id, { status: "converted", updated_at: new Date().toISOString() });
                      }
                    }}>Convert to Lead</Btn>
                  )}
                  {(inq.status === "new" || inq.status === "contacted") && <Btn sm v="ghost" onClick={() => updateInquiry(inq.id, { status: "dismissed", updated_at: new Date().toISOString() })}>Dismiss</Btn>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
