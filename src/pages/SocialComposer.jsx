// SocialComposer — Editorial-side composer for per-publication social
// posts. M1 scope: Compose tab only, X destination only, immediate
// posting only. Queue + History + scheduling land in M2/M3.
//
// Flow per spec _specs/social-scheduling.md:
//   1. Pick publication
//   2. Pick destinations (M1 = X only; FB/IG/LinkedIn show "coming soon")
//   3. Compose body (live char counter against the strictest active limit)
//   4. Post Now → creates social_posts row, then calls social-publish
//      Edge Function with the new post id
//   5. Result modal surfaces success/failure per destination

import { useEffect, useMemo, useState } from "react";
import { Z, FS, FW, Ri, R } from "../lib/theme";
import { Btn, Sel, TA, Modal, GlassCard, SectionTitle, TabRow, TB, TabPipe, Ic } from "../components/ui";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

const AUTH_BASE = EDGE_FN_URL;

// Per-network character limits — used to drive the live counter and
// over-limit warning. M1 only enforces X's 280 because it's the only
// live destination, but the table is keyed for future M2/M3 wiring.
const LIMITS = { x: 280, facebook: 63206, instagram: 2200, linkedin: 3000 };

const DESTS = [
  { id: "x", label: "X", color: "#000000", live: true },
  { id: "facebook", label: "Facebook", color: "#1877F2", live: false },
  { id: "instagram", label: "Instagram", color: "#E1306C", live: false },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", live: false },
];

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

// Per-publication X connection check. Returns Set of pub_ids with a live X
// account so the destination toggles can disable themselves accurately.
async function fetchConnectedXPubs(pubIds) {
  if (!pubIds.length) return new Set();
  // social_accounts_safe is read-only and elides tokens — exactly what we
  // need for a "is connected" check from the client.
  const { data } = await supabase
    .from("social_accounts_safe")
    .select("pub_id, status")
    .eq("provider", "x")
    .in("pub_id", pubIds);
  return new Set((data || []).filter((r) => r.status === "connected").map((r) => r.pub_id));
}

const SocialComposer = ({ pubs = [], currentUser, isActive, onNavigate }) => {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Social Composer" }], title: "Social Composer" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);

  // Only pubs that opt into social posting via the Has Social toggle in
  // Publications settings. Filters out dormant pubs and pubs with no
  // social presence to manage, keeping the picker honest.
  const activePubs = useMemo(() => (pubs || []).filter((p) => !p.dormant && p.hasSocial), [pubs]);
  const [tab, setTab] = useState("Compose");
  const [pubId, setPubId] = useState(activePubs[0]?.id || "");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState({ x: true, facebook: false, instagram: false, linkedin: false });
  const [connectedX, setConnectedX] = useState(new Set());
  const [posting, setPosting] = useState(false);
  const [resultModal, setResultModal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchConnectedXPubs(activePubs.map((p) => p.id)).then((set) => {
      if (!cancelled) setConnectedX(set);
    });
    return () => { cancelled = true; };
  }, [activePubs]);

  // Default the picker to a publication that already has X connected, so
  // the user lands in a working state rather than an immediate "connect"
  // wall on first visit.
  useEffect(() => {
    if (!pubId && activePubs.length) setPubId(activePubs[0].id);
    if (pubId && connectedX.size && !connectedX.has(pubId)) {
      const firstConnected = activePubs.find((p) => connectedX.has(p.id));
      if (firstConnected) setPubId(firstConnected.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedX]);

  const xConnected = pubId && connectedX.has(pubId);
  const xEnabled = enabled.x && xConnected;

  // Strictest active limit drives the counter color/threshold.
  const activeLimits = Object.entries(enabled)
    .filter(([k, v]) => v && DESTS.find((d) => d.id === k)?.live)
    .map(([k]) => LIMITS[k] || 0)
    .filter(Boolean);
  const limit = activeLimits.length ? Math.min(...activeLimits) : LIMITS.x;
  const overLimit = body.length > limit;

  const canPost = !!pubId && !!body.trim() && xEnabled && !overLimit && !posting;

  const handlePostNow = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      // 1. Insert draft. Targets snapshot the toggle state at submit time —
      //    the worker reads this rather than re-reading the UI state, so a
      //    re-trigger of the same post id always lands the same destinations.
      const targets = DESTS
        .filter((d) => d.live && enabled[d.id])
        .map((d) => ({ destination: d.id, enabled: true }));

      const { data: post, error: insertErr } = await supabase
        .from("social_posts")
        .insert({
          pub_id: pubId,
          author_id: currentUser?.id || null,
          body_text: body,
          targets,
          media: [],
          status: "draft",
        })
        .select("id")
        .single();

      if (insertErr || !post?.id) {
        setResultModal({ ok: false, error: insertErr?.message || "Failed to create draft" });
        setPosting(false);
        return;
      }

      // 2. Trigger immediate publish.
      const auth = await getAuthHeader();
      const res = await fetch(`${AUTH_BASE}/social-publish`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      const data = await res.json();
      setResultModal({ ok: !!data.ok, status: data.status, results: data.results, error: data.error });

      if (data.ok) {
        setBody("");
      }
    } catch (e) {
      setResultModal({ ok: false, error: e.message });
    } finally {
      setPosting(false);
    }
  };

  const selPub = activePubs.find((p) => p.id === pubId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabRow><TB tabs={["Compose", "Queue", "History"]} active={tab} onChange={setTab} /></TabRow>

      {tab === "Compose" && activePubs.length === 0 && (
        <GlassCard>
          <SectionTitle>No publications with social enabled</SectionTitle>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 8 }}>
            Open a publication in Publications settings and switch on <strong>Has Social</strong> to make it postable here.
          </div>
          {onNavigate && <Btn sm onClick={() => onNavigate("publications")}>Open Publications →</Btn>}
        </GlassCard>
      )}

      {tab === "Compose" && activePubs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* ── Composer column ─────────────────────────── */}
          <GlassCard>
            <SectionTitle>Compose</SectionTitle>
            <Sel
              label="Publication"
              value={pubId}
              onChange={(e) => setPubId(e.target.value)}
              options={activePubs.map((p) => ({ value: p.id, label: p.name }))}
            />

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", marginBottom: 6 }}>Destinations</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {DESTS.map((d) => {
                  const isX = d.id === "x";
                  const connected = isX ? connectedX.has(pubId) : false;
                  const disabled = !d.live || (isX && !connected);
                  return (
                    <label
                      key={d.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        background: Z.sa,
                        borderRadius: Ri,
                        border: `1px solid ${Z.bd}`,
                        opacity: disabled ? 0.55 : 1,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!enabled[d.id] && !disabled}
                        disabled={disabled}
                        onChange={(e) => setEnabled((prev) => ({ ...prev, [d.id]: e.target.checked }))}
                      />
                      <div style={{ width: 22, height: 22, borderRadius: R, background: d.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: FS.xs, fontWeight: FW.heavy }}>
                        {d.label[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{d.label}</div>
                        <div style={{ fontSize: FS.xs, color: Z.tm }}>
                          {!d.live ? "Coming soon" : connected ? "Connected" : "Connect this publication first"}
                        </div>
                      </div>
                      {isX && !connected && d.live && onNavigate && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); onNavigate("publications", { pubId }); }}
                          style={{ background: "transparent", border: "none", color: Z.ac, fontSize: FS.xs, fontWeight: FW.heavy, cursor: "pointer" }}
                        >
                          Connect →
                        </button>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <TA
                label="Post"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What's happening?"
                rows={5}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: FS.xs, color: overLimit ? Z.da : Z.tm }}>
                <span>{overLimit ? "Over the limit for X (280 chars)." : "X limits posts to 280 chars."}</span>
                <span style={{ fontWeight: FW.heavy }}>{body.length} / {limit}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <Btn onClick={handlePostNow} disabled={!canPost}>
                <Ic.send size={12} /> {posting ? "Posting…" : "Post Now"}
              </Btn>
            </div>
          </GlassCard>

          {/* ── Preview column ──────────────────────────── */}
          <GlassCard>
            <SectionTitle>Preview</SectionTitle>
            <div style={{ padding: 14, background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", marginBottom: 6 }}>X · {selPub?.name || "—"}</div>
              <div style={{ fontSize: FS.base, color: Z.tx, whiteSpace: "pre-wrap", minHeight: 80 }}>
                {body || <span style={{ color: Z.tm }}>Your post will appear here.</span>}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: FS.xs, color: Z.tm }}>
              FB / Instagram / LinkedIn previews will land in the next milestone.
            </div>
          </GlassCard>
        </div>
      )}

      {tab === "Queue" && (
        <GlassCard>
          <SectionTitle>Queue</SectionTitle>
          <div style={{ fontSize: FS.sm, color: Z.tm }}>
            Scheduled posts will appear here when scheduling lands in Milestone 2.
          </div>
        </GlassCard>
      )}

      {tab === "History" && (
        <GlassCard>
          <SectionTitle>History</SectionTitle>
          <div style={{ fontSize: FS.sm, color: Z.tm }}>
            Published / failed posts will appear here. M1 ships immediate-only posting; the History view ships in M3 alongside Retry.
          </div>
          {/* TODO(M3): supabase.from('social_posts').select(...).in('status', ['published','partial','failed']) */}
          <TabPipe />
        </GlassCard>
      )}

      {/* Result modal — shown after a Post Now attempt. */}
      <Modal open={!!resultModal} onClose={() => setResultModal(null)} title={resultModal?.ok ? "Post sent" : "Post failed"}>
        {resultModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {resultModal.error && <div style={{ fontSize: FS.sm, color: Z.da }}>{resultModal.error}</div>}
            {Array.isArray(resultModal.results) && resultModal.results.map((r, i) => (
              <div key={i} style={{ padding: "8px 10px", background: Z.sa, borderRadius: Ri, border: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{r.destination}</span>
                <span style={{ fontSize: FS.sm, color: r.ok ? Z.su : Z.da }}>{r.ok ? "Sent" : "Failed"}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <Btn onClick={() => setResultModal(null)}>Close</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SocialComposer;
