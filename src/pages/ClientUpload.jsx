// ============================================================
// ClientUpload.jsx — Public client asset upload page
// No auth required — accessed via /upload/:token
// ============================================================
import { useState, useEffect, useRef } from "react";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

const PROXY_URL = EDGE_FN_URL + "/bunny-storage";

const C = {
  bg: "#F6F7F9", sf: "#FFFFFF", tx: "#0D0F14", tm: "#525E72", td: "#8994A7",
  bd: "#E2E6ED", ac: "#2563EB", go: "#16A34A", da: "#DC2626", wa: "#D97706",
};

export default function ClientUpload() {
  const token = window.location.pathname.split("/upload/")[1];

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!token) { setError("Invalid upload link."); setLoading(false); return; }
    (async () => {
      const { data, error: err } = await supabase
        .from("ad_projects")
        .select("id, client_id, client_contact_name, client_contact_email, publication_id, ad_size, client_assets_path, client_upload_token")
        .eq("client_upload_token", token)
        .maybeSingle();
      if (err || !data) {
        setError("This upload link is invalid or has expired.");
      } else {
        setProject(data);
      }
      setLoading(false);
    })();
  }, [token]);

  const handleFiles = (e) => {
    const newFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const newFiles = Array.from(e.dataTransfer.files || []);
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const upload = async () => {
    if (!project || files.length === 0) return;
    setUploading(true);

    const basePath = project.client_assets_path || `client-assets/${project.id}`;

    for (const file of files) {
      const path = `${basePath}/${file.name}`;
      const reader = new FileReader();
      const base64 = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(file);
      });

      await fetch(PROXY_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, body: base64, contentType: file.type }),
      });

      setUploadedFiles(prev => [...prev, { name: file.name, type: file.type, size: file.size }]);
    }

    // Save the assets path on the project if not set
    if (!project.client_assets_path) {
      await supabase.from("ad_projects").update({ client_assets_path: basePath }).eq("id", project.id);
    }

    // Jen P0.4: notify the assigned designer so they see the new
    // assets in their NotificationPopover (and in the project's
    // team_notes feed). RLS allows this anon insert specifically
    // when from_user IS NULL + context_type='ad_project'.
    if (project.designer_id) {
      try {
        await supabase.from("team_notes").insert({
          to_user: project.designer_id,
          from_user: null,
          message: `Client uploaded ${files.length} file${files.length === 1 ? "" : "s"}${project.ad_size ? ` for ${project.ad_size}` : ""}`,
          context_type: "ad_project",
          context_id: project.id,
        });
      } catch (_e) {
        // Failure to ping the designer shouldn't block the upload —
        // the files are already in storage. Designer will see them
        // on next AssetPanel refresh either way.
      }
    }

    setFiles([]);
    setUploading(false);
  };

  const box = {
    maxWidth: 560, margin: "60px auto", padding: 32,
    background: C.sf, borderRadius: 8, border: `1px solid ${C.bd}`,
    fontFamily: "Arial, sans-serif",
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: C.td }}>Loading...</p>
    </div>;
  }

  if (error) {
    return <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ ...box, textAlign: "center" }}>
        <h2 style={{ color: C.da, margin: "0 0 12px" }}>Invalid Link</h2>
        <p style={{ color: C.tm }}>{error}</p>
      </div>
    </div>;
  }

  return <div style={{ minHeight: "100vh", background: C.bg }}>
    <div style={box}>
      <h2 style={{ color: C.tx, margin: "0 0 8px" }}>Upload Your Ad Materials</h2>
      <p style={{ color: C.tm, fontSize: 14, marginBottom: 20 }}>
        {project.client_contact_name && <span>Hi {project.client_contact_name}, </span>}
        please upload your files for your {project.ad_size || "ad"} project.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${C.bd}`, borderRadius: 8, padding: 32,
          textAlign: "center", cursor: "pointer", marginBottom: 16,
          background: files.length > 0 ? "#f0fdf4" : C.bg,
        }}
      >
        <p style={{ color: C.tm, margin: 0 }}>
          Drag files here or click to browse
        </p>
        <p style={{ color: C.td, fontSize: 12, margin: "8px 0 0" }}>
          Logos, images, copy documents, fonts
        </p>
        <input ref={fileRef} type="file" multiple onChange={handleFiles} style={{ display: "none" }} />
      </div>

      {/* Staged files */}
      {files.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.tm, marginBottom: 8, textTransform: "uppercase" }}>
            Ready to upload ({files.length})
          </div>
          {files.map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.bd}` }}>
              <span style={{ fontSize: 13, color: C.tx }}>{f.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: C.td }}>{(f.size / 1024).toFixed(0)} KB</span>
                <button onClick={() => removeFile(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.da, fontSize: 14, fontWeight: 700 }}>x</button>
              </div>
            </div>
          ))}
          <button
            onClick={upload}
            disabled={uploading}
            style={{
              marginTop: 12, width: "100%", padding: "12px 0",
              background: uploading ? C.td : C.ac, color: "#fff",
              border: "none", borderRadius: 6, fontSize: 15,
              fontWeight: 700, cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? "Uploading..." : `Upload ${files.length} file${files.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.go, marginBottom: 8, textTransform: "uppercase" }}>
            Uploaded ({uploadedFiles.length})
          </div>
          {uploadedFiles.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <span style={{ color: C.go, fontWeight: 700 }}>+</span>
              <span style={{ fontSize: 13, color: C.tx }}>{f.name}</span>
            </div>
          ))}
        </div>
      )}

      {uploadedFiles.length > 0 && files.length === 0 && (
        <div style={{ marginTop: 20, padding: 16, background: "#f0fdf4", borderRadius: 6, textAlign: "center" }}>
          <p style={{ color: C.go, fontWeight: 700, margin: "0 0 4px" }}>Files received — thank you!</p>
          <p style={{ color: C.tm, fontSize: 13, margin: 0 }}>Our design team will be in touch with your proof.</p>
        </div>
      )}
    </div>
  </div>;
}
