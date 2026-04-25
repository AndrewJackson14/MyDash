// UploadContractModal — Christie's primary in-field flow.
//
// Christie writes a paper OpenDoor Directories order, snaps photos
// of it (multi-page if needed), and the Mac Mini parser converts
// it into a MyDash proposal draft within ~30 seconds.
//
// This modal handles the upload half:
//   1. User picks 1+ photos via the camera (capture="environment")
//      or the gallery. iOS supports both with a native action sheet.
//   2. Each photo uploads to the contract-imports bucket under
//      {auth_uid}/{import_id}/{idx}.jpg. We pre-mint the import_id
//      client-side so all photos in a batch share a folder.
//   3. We insert a contract_imports row in 'pending' status with
//      the storage_paths array populated.
//   4. The Mac Mini worker (LaunchAgent) picks the row up, runs
//      the photos through Gemini Vision, sets status='extracted'.
//   5. Mobile review queue (separate component) surfaces the
//      result for human confirmation → convert to proposal.
import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { TOKENS, SURFACE, INK, ACCENT, GOLD } from "./mobileTokens";

export default function UploadContractModal({ currentUser, prefillClient, onClose, onUploaded }) {
  const [files, setFiles] = useState([]);  // [{file, previewUrl}]
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null); // { sent, total, error }
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const addFiles = (fileList) => {
    const next = Array.from(fileList || []).map(f => ({
      file: f,
      previewUrl: URL.createObjectURL(f),
      name: f.name,
    }));
    setFiles(prev => [...prev, ...next]);
  };

  const removeFile = (idx) => {
    setFiles(prev => {
      const next = prev.slice();
      const removed = next.splice(idx, 1)[0];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  const upload = async () => {
    if (uploading || files.length === 0) return;
    setUploading(true);
    setProgress({ sent: 0, total: files.length });

    try {
      // Pre-mint the import id so all files in this batch share a folder.
      const importId = crypto.randomUUID();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Not signed in");

      // Upload photos to {auth_uid}/{import_id}/{idx}-{name}.
      const storagePaths = [];
      for (let i = 0; i < files.length; i++) {
        const { file } = files[i];
        const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || ".jpg").toLowerCase();
        const path = `${user.id}/${importId}/${String(i).padStart(2, "0")}${ext}`;
        const { error: upErr } = await supabase.storage
          .from("contract-imports")
          .upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
        if (upErr) throw new Error(`Photo ${i + 1}: ${upErr.message}`);
        storagePaths.push(path);
        setProgress({ sent: i + 1, total: files.length });
      }

      // Insert the queue row. A DB trigger fires the contract-importer
      // Edge Function within ~1s; a 5-min cron drain is the safety net.
      const { data, error: insErr } = await supabase
        .from("contract_imports")
        .insert({
          id: importId,
          uploaded_by: currentUser?.id || null,
          storage_paths: storagePaths,
          status: "pending",
          notes: notes.trim() || null,
          // Pre-binding to a client skips the parser's most error-prone
          // field (handwritten name) — the reviewer just confirms the
          // line items + total instead of also matching the client.
          client_id: prefillClient?.id || null,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      // Brief success state so the user has visual confirmation before
      // we close — closing-on-resolve was too fast to register on iOS.
      setProgress({ sent: files.length, total: files.length, success: true });
      setTimeout(() => {
        onUploaded?.(data);
        onClose();
      }, 900);
    } catch (e) {
      setProgress(p => ({ ...(p || {}), error: String(e?.message ?? e) }));
      setUploading(false);
    }
  };

  return <div style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.55)" }}>
    <div onClick={uploading ? undefined : onClose} style={{ flex: 1 }} />
    <div style={{
      background: SURFACE.elevated,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: "env(safe-area-inset-bottom)",
      maxHeight: "92vh", overflowY: "auto",
      animation: "slideUp 0.2s ease-out",
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div style={{ width: 40, height: 4, background: TOKENS.rule, borderRadius: 2, margin: "12px auto 4px" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px 4px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>Upload contract</div>
        <button onClick={onClose} disabled={uploading} style={{ background: "transparent", border: "none", cursor: uploading ? "not-allowed" : "pointer", color: TOKENS.muted, fontSize: 14, fontWeight: 600, padding: 4 }}>
          {uploading ? "" : "Cancel"}
        </button>
      </div>

      <div style={{ padding: "8px 18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {prefillClient && <div style={{ padding: "10px 14px", background: ACCENT + "10", borderRadius: 10, border: `1px solid ${ACCENT}30`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>For client</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginTop: 2 }}>{prefillClient.name}</div>
          </div>
          <span style={{ fontSize: 12, color: ACCENT, fontWeight: 700 }}>✓ pre-bound</span>
        </div>}

        <div style={{ padding: "10px 14px", background: SURFACE.alt, borderRadius: 10, fontSize: 13, color: TOKENS.muted, lineHeight: 1.5 }}>
          Snap one or more photos of the paper contract. The parser reads
          them within ~30 seconds and queues a draft for your review
          {prefillClient ? "" : " — including a best-guess client match"}.
        </div>

        {/* Photo picker buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => cameraInputRef.current?.click()} disabled={uploading} style={pickerBtnStyle(true)}>
            <span style={{ fontSize: 28 }}>📷</span>
            <span>Camera</span>
          </button>
          <button onClick={() => galleryInputRef.current?.click()} disabled={uploading} style={pickerBtnStyle(false)}>
            <span style={{ fontSize: 28 }}>🖼</span>
            <span>Gallery</span>
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={e => addFiles(e.target.files)}
          style={{ display: "none" }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={e => addFiles(e.target.files)}
          style={{ display: "none" }}
        />

        {/* Thumbnails + remove */}
        {files.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {files.map((f, i) => <div key={i} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", background: SURFACE.alt }}>
            <img src={f.previewUrl} alt={`Page ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button onClick={() => removeFile(i)} disabled={uploading} style={{
              position: "absolute", top: 4, right: 4,
              width: 28, height: 28, borderRadius: 14,
              background: "rgba(0,0,0,0.6)", color: "#FFFFFF",
              border: "none", cursor: "pointer", fontSize: 14, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>×</button>
            <div style={{
              position: "absolute", left: 4, bottom: 4,
              padding: "2px 6px", borderRadius: 4,
              background: "rgba(0,0,0,0.6)", color: "#FFFFFF",
              fontSize: 10, fontWeight: 700,
            }}>{i + 1}</div>
          </div>)}
        </div>}

        {/* Optional note */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Note (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything the parser should know — e.g. 'paid in full at signing', 'second page is the brief'"
            rows={2}
            disabled={uploading}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px",
              fontSize: 15, color: INK,
              background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`,
              borderRadius: 10, outline: "none", resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>

        {progress && progress.error && <div style={{ padding: "10px 12px", background: TOKENS.urgent + "12", borderRadius: 8, color: TOKENS.urgent, fontSize: 13 }}>
          {progress.error}
        </div>}

        {progress && !progress.error && !progress.success && uploading && <div style={{ padding: "10px 12px", background: SURFACE.alt, borderRadius: 8, color: TOKENS.muted, fontSize: 13 }}>
          Uploading {progress.sent}/{progress.total}…
        </div>}

        {progress?.success && <div style={{ padding: "12px 14px", background: TOKENS.good + "12", border: `1px solid ${TOKENS.good}30`, borderRadius: 10, color: TOKENS.good, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <span>Sent to parser. You'll see the draft on Home in ~30s.</span>
        </div>}

        <button
          onClick={upload}
          disabled={files.length === 0 || uploading}
          style={{
            width: "100%", padding: "14px", minHeight: 52,
            background: files.length === 0 || uploading ? TOKENS.rule : ACCENT,
            color: files.length === 0 || uploading ? TOKENS.muted : "#FFFFFF",
            border: "none", borderRadius: 10,
            fontSize: 16, fontWeight: 700, cursor: files.length === 0 || uploading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >{uploading ? "Uploading…" : files.length === 0 ? "Add photos to upload" : `Send ${files.length} photo${files.length === 1 ? "" : "s"} to parser`}</button>

        <div style={{ fontSize: 11, color: TOKENS.muted, textAlign: "center" }}>
          You'll see the parsed draft on Home under "In review" once it's ready.
        </div>
      </div>
    </div>
  </div>;
}

function pickerBtnStyle(highlight) {
  return {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 6, padding: "16px 4px", minHeight: 80,
    background: highlight ? ACCENT + "10" : SURFACE.alt,
    color: highlight ? ACCENT : INK,
    border: `1px solid ${highlight ? ACCENT + "40" : TOKENS.rule}`,
    borderRadius: 10,
    fontSize: 13, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
  };
}
