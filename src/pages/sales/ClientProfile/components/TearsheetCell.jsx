import { useState, useRef } from "react";
import { Z, COND, FS, FW } from "../../../../lib/theme";
import { supabase, EDGE_FN_URL } from "../../../../lib/supabase";
import SendTearsheetModal from "../../../../components/SendTearsheetModal";

// Per-sale tearsheet upload cell. Inline file picker hits the
// upload-tearsheet edge function, then optimistically updates the
// parent sales array via setSales so the row's status flips to
// ✓ Uploaded immediately. Resilient to no-setSales callers — falls
// back to a no-op (the page reload will pick up the new tearsheet_url).
export default function TearsheetCell({ sale, client, setSales }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const inputRef = useRef(null);
  const hasTearsheet = !!sale.tearsheetUrl;
  const isImage = sale.tearsheetKind === "image"
    || (hasTearsheet && /\.(jpe?g|png|webp|gif|avif|heic)(\?|$)/i.test(sale.tearsheetUrl));

  const onPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    upload(file);
  };

  const upload = async (file) => {
    if (uploading) return;
    setUploading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("not signed in");
      const form = new FormData();
      form.append("sale_id", sale.id);
      form.append("file", file);
      const res = await fetch(`${EDGE_FN_URL}/upload-tearsheet`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || `upload failed: ${res.status}`);
      if (typeof setSales === "function") {
        setSales(prev => prev.map(s => s.id === sale.id ? {
          ...s,
          tearsheetUrl: out.tearsheet_url,
          tearsheetFilename: out.filename,
          tearsheetKind: out.kind,
          tearsheetUploadedAt: new Date().toISOString(),
        } : s));
      }
    } catch (err) {
      console.error("Tearsheet upload failed:", err);
      setError(err.message || "upload failed");
      setTimeout(() => setError(null), 3000);
    }
    setUploading(false);
  };

  const triggerPick = () => {
    if (inputRef.current) inputRef.current.click();
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic"
        onChange={onPick}
        style={{ display: "none" }}
      />
      {hasTearsheet ? (
        <>
          <a
            href={sale.tearsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open tearsheet · ${isImage ? "image" : "PDF"}${sale.tearsheetFilename ? ` · ${sale.tearsheetFilename}` : ""}`}
            style={{ fontSize: FS.micro, color: Z.go, fontFamily: COND, fontWeight: FW.bold, padding: "1px 6px", background: Z.go + "12", borderRadius: 999, textDecoration: "none" }}
          >
            ✓ Tearsheet
          </a>
          <button
            onClick={() => setSendOpen(true)}
            title="Email tearsheet link to client"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: Z.ac, fontSize: FS.xs, fontFamily: COND }}
          >
            ✉
          </button>
          <button
            onClick={triggerPick}
            disabled={uploading}
            title="Replace tearsheet"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: Z.tm, fontSize: FS.xs, fontFamily: COND }}
          >
            {uploading ? "…" : "↺"}
          </button>
        </>
      ) : (
        <button
          onClick={triggerPick}
          disabled={uploading}
          title="Upload tearsheet (PDF or image)"
          style={{ background: "transparent", border: `1px dashed ${Z.bd}`, borderRadius: 999, padding: "1px 8px", cursor: "pointer", color: Z.tm, fontSize: FS.micro, fontFamily: COND }}
        >
          {uploading ? "Uploading…" : "⤴ Tearsheet"}
        </button>
      )}
      {error && <span style={{ fontSize: 9, color: Z.da, fontFamily: COND }}>{error.slice(0, 40)}</span>}
      {sendOpen && (
        <SendTearsheetModal client={client} sale={sale} onClose={() => setSendOpen(false)} />
      )}
    </span>
  );
}
