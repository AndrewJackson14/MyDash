// SocialComposer — Editorial-side composer for per-publication social
// posts. Compose / Queue tabs are functional for X (post now or
// schedule). FB / IG / LinkedIn unlock as those auth flows ship.
//
// Compose flow:
//   1. Pick publication (filtered to has_social = true)
//   2. Pick destinations (X live; others coming soon)
//   3. Compose body (live char counter against strictest active limit)
//   4. Optionally attach up to 4 images (Bunny CDN via upload-image)
//   5. Choose Now or Schedule; on schedule the row goes to status =
//      scheduled and the social-cron Edge Function picks it up at the
//      requested time
//
// Queue flow: lists status='scheduled' posts; cancel reverts to draft.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Z, FS, FW, R } from "../lib/theme";
import { Btn, Sel, TA, Modal, GlassCard, SectionTitle, TabRow, TB, TabPipe, Ic } from "../components/ui";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

// X allows up to 4 images per tweet. Cap on the client too so users
// don't try to upload 10 and then wonder why only 4 attach.
const MAX_IMAGES = 4;
// X media size cap is 5MB for images; reject locally so we don't
// burn a Bunny PUT on a file the publish step will reject anyway.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const AUTH_BASE = EDGE_FN_URL;

// Per-network character limits — used to drive the live counter and
// over-limit warning. M1 only enforces X's 280 because it's the only
// live destination, but the table is keyed for future M2/M3 wiring.
const LIMITS = { x: 280, facebook: 63206, instagram: 2200, linkedin: 3000 };

// Instagram intentionally absent: Meta's native Page → IG cross-post
// (configured per-Page in Business Suite) handles the IG mirror as a
// side-effect of every FB post. Avoiding a second OAuth flow + App
// Review for Instagram-specific scopes.
const DESTS = [
  { id: "x", label: "X", color: "#000000", live: true },
  { id: "facebook", label: "Facebook", color: "#1877F2", live: true },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", live: false },
];

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

// Per-publication connection check. Returns a {x, facebook} shape per
// pub_id so the destination toggles can gate themselves accurately.
// Instagram doesn't appear here — it rides on Meta's native Page → IG
// cross-post setup, not a separate connection in MyDash.
async function fetchConnectionMap(pubIds) {
  const empty = { x: new Set(), facebook: new Set() };
  if (!pubIds.length) return empty;
  const { data } = await supabase
    .from("social_accounts_safe")
    .select("pub_id, provider, status")
    .in("pub_id", pubIds);
  const result = { x: new Set(), facebook: new Set() };
  for (const row of data || []) {
    if (row.status !== "connected") continue;
    if (row.provider === "x") result.x.add(row.pub_id);
    if (row.provider === "facebook") result.facebook.add(row.pub_id);
  }
  return result;
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
  const [enabled, setEnabled] = useState({ x: true, facebook: false, linkedin: false });
  const [connections, setConnections] = useState({ x: new Set(), facebook: new Set() });
  const [posting, setPosting] = useState(false);
  const [resultModal, setResultModal] = useState(null);

  // Image attachments — array of { url, type:'image', alt, byte_size }.
  // The publish worker reads this and uploads each image to X via the
  // /2/media/upload + media_id flow before attaching to the tweet.
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Schedule control — 'now' fires social-publish synchronously; 'later'
  // writes status='scheduled' + scheduled_for, leaving the actual send
  // to the social-cron worker.
  const [when, setWhen] = useState("now");
  const [scheduledFor, setScheduledFor] = useState(""); // datetime-local string

  // Queue tab data — only loaded when tab is active to keep boot quick.
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConnectionMap(activePubs.map((p) => p.id)).then((c) => {
      if (!cancelled) setConnections(c);
    });
    return () => { cancelled = true; };
  }, [activePubs]);

  // Default the picker to any publication that has at least one network
  // connected, so the user lands in a working state rather than an
  // immediate "connect" wall on first visit.
  useEffect(() => {
    if (!pubId && activePubs.length) setPubId(activePubs[0].id);
    const anyOn = (id) => connections.x.has(id) || connections.facebook.has(id);
    if (pubId && (connections.x.size || connections.facebook.size) && !anyOn(pubId)) {
      const first = activePubs.find((p) => anyOn(p.id));
      if (first) setPubId(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections]);

  // ── Image upload ───────────────────────────────────────────
  // Streams each selected file straight to upload-image (Bunny CDN)
  // and appends the returned URL to local state. We don't use signed
  // uploads — the Edge Function gates on the user's JWT and an
  // allowlisted "social-media/" path prefix.
  const uploadFiles = useCallback(async (fileList) => {
    if (!pubId) return;
    const files = Array.from(fileList || []).slice(0, MAX_IMAGES - images.length);
    if (!files.length) return;
    setUploading(true);
    try {
      const auth = await getAuthHeader();
      if (!auth) return;
      const uploaded = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > MAX_IMAGE_BYTES) continue;
        const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const res = await fetch(`${EDGE_FN_URL}/upload-image`, {
          method: "POST",
          headers: {
            Authorization: auth,
            "x-upload-path": `social-media/${pubId}`,
            "x-file-name": filename,
            "x-content-type": file.type || "image/jpeg",
          },
          body: file,
        });
        if (res.ok) {
          const { url } = await res.json();
          uploaded.push({ url, type: "image", alt: "", byte_size: file.size });
        }
      }
      if (uploaded.length) setImages((prev) => [...prev, ...uploaded].slice(0, MAX_IMAGES));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [pubId, images.length]);

  const removeImage = (idx) => setImages((prev) => prev.filter((_, i) => i !== idx));

  // ── Queue loader ───────────────────────────────────────────
  // Loads scheduled posts authored by anyone — the team's queue is
  // collective, not per-author. Cancel sends them back to draft so the
  // composer flow can be reused to edit.
  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const { data } = await supabase
        .from("social_posts")
        .select("id, pub_id, body_text, targets, scheduled_for, status, author_id, media")
        .eq("status", "scheduled")
        .order("scheduled_for", { ascending: true });
      setQueue(data || []);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "Queue") loadQueue();
  }, [tab, loadQueue]);

  const cancelScheduled = async (id) => {
    await supabase
      .from("social_posts")
      .update({ status: "draft", scheduled_for: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    loadQueue();
  };

  // Per-destination connection check. IG depends on the FB row carrying
  // a linked IG Business account.
  const isConnected = (destId) => !!(pubId && connections[destId]?.has(pubId));
  // Active = enabled AND connected AND live. Used for the submit gate
  // and the strictest-limit calculation.
  const activeDestIds = DESTS.filter((d) => d.live && enabled[d.id] && isConnected(d.id)).map((d) => d.id);
  const anyEnabled = activeDestIds.length > 0;

  // Strictest active limit drives the counter color/threshold.
  const activeLimits = activeDestIds.map((k) => LIMITS[k] || 0).filter(Boolean);
  const limit = activeLimits.length ? Math.min(...activeLimits) : LIMITS.x;
  const overLimit = body.length > limit;

  // Schedule must be in the future. Browser's datetime-local lacks tz
  // suffix; treat as local-time and let new Date() parse it that way.
  const scheduledIso = when === "later" && scheduledFor ? new Date(scheduledFor).toISOString() : null;
  const scheduledInPast = scheduledIso ? new Date(scheduledIso).getTime() <= Date.now() + 30000 : false;
  const scheduleValid = when === "now" || (when === "later" && scheduledFor && !scheduledInPast);

  const canPost = !!pubId && !!body.trim() && anyEnabled && !overLimit && !posting && !uploading && scheduleValid;

  const handleSubmit = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      const targets = DESTS
        .filter((d) => d.live && enabled[d.id])
        .map((d) => ({ destination: d.id, enabled: true }));

      // For scheduled posts we go straight to status='scheduled' so the
      // social-cron worker is the only thing that ever flips them to
      // publishing — keeps the lifecycle linear.
      const isScheduled = when === "later";
      // social_posts.author_id FKs to auth.users(id), not team_members(id).
      // The MyDash currentUser shape is a team row with the auth user id
      // exposed as `authId` — use that, fall back to a live auth lookup
      // for any role that boots without a team row pre-resolved.
      let authorId = currentUser?.authId || null;
      if (!authorId) {
        const { data: { user } } = await supabase.auth.getUser();
        authorId = user?.id || null;
      }
      const insertRow = {
        pub_id: pubId,
        author_id: authorId,
        body_text: body,
        targets,
        media: images,
        status: isScheduled ? "scheduled" : "draft",
        scheduled_for: isScheduled ? scheduledIso : null,
      };

      const { data: post, error: insertErr } = await supabase
        .from("social_posts")
        .insert(insertRow)
        .select("id")
        .single();

      if (insertErr || !post?.id) {
        setResultModal({ ok: false, error: insertErr?.message || "Failed to create post" });
        setPosting(false);
        return;
      }

      if (isScheduled) {
        // Scheduling path — no immediate publish call. Surface the
        // confirmation in the same result modal so the user sees the
        // when/where before composing the next one.
        setResultModal({
          ok: true,
          scheduled: true,
          scheduledFor: scheduledIso,
        });
        setBody("");
        setImages([]);
        setWhen("now");
        setScheduledFor("");
        return;
      }

      // Immediate path — fire the publish worker synchronously.
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
        setImages([]);
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
              {/* Header + Select All. Toggle flips between selecting every
                  live+connected destination and clearing them. Disabled
                  rows (LinkedIn coming soon, unconnected providers)
                  don't participate in either direction. */}
              {(() => {
                const selectable = DESTS.filter((d) => d.live && isConnected(d.id));
                const allOn = selectable.length > 0 && selectable.every((d) => enabled[d.id]);
                const toggleAll = () => {
                  setEnabled((prev) => {
                    const next = { ...prev };
                    for (const d of selectable) next[d.id] = !allOn;
                    return next;
                  });
                };
                return (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase" }}>Destinations</div>
                    {selectable.length > 1 && (
                      <button
                        type="button"
                        onClick={toggleAll}
                        style={{ background: "transparent", border: "none", color: Z.ac, fontSize: FS.xs, fontWeight: FW.heavy, cursor: "pointer", padding: 0 }}
                      >
                        {allOn ? "Deselect all" : `Select all (${selectable.length})`}
                      </button>
                    )}
                  </div>
                );
              })()}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {DESTS.map((d) => {
                  const connected = isConnected(d.id);
                  const disabled = !d.live || !connected;
                  const subtext = !d.live
                    ? "Coming soon"
                    : !connected
                      ? "Connect this publication first"
                      : d.id === "facebook"
                        ? "Connected · auto cross-posts to Instagram"
                        : "Connected";
                  return (
                    <label
                      key={d.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        background: Z.sa,
                        borderRadius: 13,
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
                          {subtext}
                        </div>
                      </div>
                      {!connected && d.live && onNavigate && (
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

            {/* ── Image attachments ───────────────────────── */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase" }}>Images</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>{images.length} / {MAX_IMAGES}</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => uploadFiles(e.target.files)}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {images.map((img, i) => (
                  <div key={i} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 13, overflow: "hidden", border: `1px solid ${Z.bd}` }}>
                    <img src={img.url} alt={img.alt || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", fontSize: 12, lineHeight: 1, cursor: "pointer" }}
                      aria-label="Remove image"
                    >×</button>
                  </div>
                ))}
                {images.length < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{ aspectRatio: "1 / 1", borderRadius: 13, border: `1px dashed ${Z.bd}`, background: Z.sa, color: Z.tm, fontSize: FS.xs, cursor: uploading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}
                  >
                    <Ic.plus size={16} />
                    <span>{uploading ? "Uploading…" : "Add image"}</span>
                  </button>
                )}
              </div>
              <div style={{ marginTop: 4, fontSize: FS.xs, color: Z.tm }}>JPG / PNG / GIF up to 5MB each. X allows up to 4 images per post.</div>
            </div>

            {/* ── When ──────────────────────────────────── */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", marginBottom: 6 }}>When</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { id: "now", label: "Post now" },
                  { id: "later", label: "Schedule" },
                ].map((opt) => (
                  <label key={opt.id} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", background: when === opt.id ? Z.ac : Z.sa, color: when === opt.id ? "#fff" : Z.tx, borderRadius: 13, border: `1px solid ${when === opt.id ? Z.ac : Z.bd}`, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.heavy, transition: "background 0.15s" }}>
                    <input
                      type="radio"
                      name="when"
                      value={opt.id}
                      checked={when === opt.id}
                      onChange={() => setWhen(opt.id)}
                      style={{ display: "none" }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {when === "later" && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    style={{ width: "100%", background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: 13, padding: "8px 10px", color: Z.tx, fontSize: FS.base, outline: "none" }}
                  />
                  {scheduledFor && scheduledInPast && (
                    <div style={{ marginTop: 4, fontSize: FS.xs, color: Z.da }}>Pick a time at least a minute in the future.</div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <Btn onClick={handleSubmit} disabled={!canPost}>
                <Ic.send size={12} /> {posting ? "Saving…" : when === "later" ? "Schedule Post" : "Post Now"}
              </Btn>
            </div>
          </GlassCard>

          {/* ── Preview column ──────────────────────────── */}
          <GlassCard>
            <SectionTitle>Preview</SectionTitle>
            <div style={{ padding: 14, background: Z.bg, borderRadius: 13, border: `1px solid ${Z.bd}` }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", marginBottom: 6 }}>X · {selPub?.name || "—"}</div>
              <div style={{ fontSize: FS.base, color: Z.tx, whiteSpace: "pre-wrap", minHeight: 60 }}>
                {body || <span style={{ color: Z.tm }}>Your post will appear here.</span>}
              </div>
              {images.length > 0 && (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: images.length === 1 ? "1fr" : "1fr 1fr", gap: 4, borderRadius: 13, overflow: "hidden" }}>
                  {images.map((img, i) => (
                    <img key={i} src={img.url} alt={img.alt || ""} style={{ width: "100%", aspectRatio: images.length === 1 ? "16 / 9" : "1 / 1", objectFit: "cover", borderRadius: 6 }} />
                  ))}
                </div>
              )}
            </div>
            {when === "later" && scheduledFor && !scheduledInPast && (
              <div style={{ marginTop: 10, padding: 10, background: Z.sa, borderRadius: 13, border: `1px solid ${Z.bd}`, fontSize: FS.xs, color: Z.tm }}>
                Will publish at <strong style={{ color: Z.tx }}>{new Date(scheduledFor).toLocaleString()}</strong>
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: FS.xs, color: Z.tm }}>
              FB / Instagram / LinkedIn previews will land in the next milestone.
            </div>
          </GlassCard>
        </div>
      )}

      {tab === "Queue" && (
        <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <SectionTitle>Queue</SectionTitle>
            <Btn sm v="ghost" onClick={loadQueue} disabled={queueLoading}>{queueLoading ? "Loading…" : "Refresh"}</Btn>
          </div>
          {queueLoading ? (
            <div style={{ fontSize: FS.sm, color: Z.tm }}>Loading scheduled posts…</div>
          ) : queue.length === 0 ? (
            <div style={{ fontSize: FS.sm, color: Z.tm }}>No scheduled posts. Compose one and pick "Schedule" to add to the queue.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {queue.map((q) => {
                const pub = activePubs.find((p) => p.id === q.pub_id);
                const dests = (Array.isArray(q.targets) ? q.targets : []).filter((t) => t.enabled).map((t) => t.destination);
                const mediaCount = Array.isArray(q.media) ? q.media.length : 0;
                return (
                  <div key={q.id} style={{ padding: 12, background: Z.sa, borderRadius: 13, border: `1px solid ${Z.bd}`, display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", marginBottom: 4 }}>
                        {pub?.name || q.pub_id} · {dests.join(", ").toUpperCase()}{mediaCount > 0 ? ` · ${mediaCount} image${mediaCount === 1 ? "" : "s"}` : ""}
                      </div>
                      <div style={{ fontSize: FS.base, color: Z.tx, whiteSpace: "pre-wrap" }}>{q.body_text}</div>
                      <div style={{ marginTop: 6, fontSize: FS.xs, color: Z.tm }}>
                        Will publish at <strong style={{ color: Z.tx }}>{q.scheduled_for ? new Date(q.scheduled_for).toLocaleString() : "—"}</strong>
                      </div>
                    </div>
                    <Btn sm v="cancel" onClick={() => cancelScheduled(q.id)}>Cancel</Btn>
                  </div>
                );
              })}
            </div>
          )}
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

      {/* Result modal — shown after Post Now or Schedule. Three flavors:
          (1) scheduled confirmation, (2) immediate-post per-destination
          summary, (3) error. */}
      <Modal
        open={!!resultModal}
        onClose={() => setResultModal(null)}
        title={resultModal?.scheduled ? "Scheduled" : resultModal?.ok ? "Post sent" : "Post failed"}
      >
        {resultModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {resultModal.scheduled && (
              <div style={{ fontSize: FS.sm, color: Z.tx }}>
                Your post is queued. It will publish at <strong>{new Date(resultModal.scheduledFor).toLocaleString()}</strong>. You can cancel it any time before then from the Queue tab.
              </div>
            )}
            {resultModal.error && <div style={{ fontSize: FS.sm, color: Z.da }}>{resultModal.error}</div>}
            {Array.isArray(resultModal.results) && resultModal.results.map((r, i) => (
              <div key={i} style={{ padding: "8px 10px", background: Z.sa, borderRadius: 13, border: `1px solid ${Z.bd}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{r.destination}</span>
                  <span style={{ fontSize: FS.sm, color: r.ok ? Z.su : Z.da }}>{r.ok ? "Sent" : "Failed"}</span>
                </div>
                {!r.ok && r.error && (
                  <div style={{ marginTop: 4, fontSize: FS.xs, color: Z.da, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.error}</div>
                )}
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
