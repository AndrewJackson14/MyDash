// ============================================================
// Shared media upload + query helpers.
// Every new upload in the app goes through uploadMedia() so it
// lands on Bunny CDN at /media/YYYY/MM/ AND writes a tagged
// media_assets row in one shot. The metadata is the permanent
// organization — folders are just physical layout.
// ============================================================
import { supabase, EDGE_FN_URL } from "./supabase";

export const CDN_BASE = "https://cdn.13stars.media";
const PROXY_URL = EDGE_FN_URL + "/bunny-storage";

// ── Path helpers ────────────────────────────────────────────
const sanitize = (name) =>
  name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

export function currentMonthPath() {
  const now = new Date();
  return `media/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function buildStoragePath(file) {
  const base = currentMonthPath();
  const uniq = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  return { dir: base, filename: uniq + "-" + sanitize(file.name) };
}

// ── Raw Bunny API via edge-function proxy ──────────────────
export async function bunnyUpload(file, dir, filename) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-action": "upload",
      "x-path": dir,
      "x-filename": encodeURIComponent(filename),
    },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }
  return res.json();
}

export async function bunnyDelete(dir, filename) {
  const res = await fetch(PROXY_URL, {
    method: "DELETE",
    headers: {
      "x-action": "delete",
      "x-path": dir,
      "x-filename": encodeURIComponent(filename),
    },
  });
  if (!res.ok) throw new Error("Delete failed: " + res.status);
}

export async function bunnyList(path) {
  const res = await fetch(PROXY_URL, {
    headers: { "x-action": "list", "x-path": path || "" },
  });
  if (!res.ok) throw new Error("List failed: " + res.status);
  return res.json();
}

// ── Image dimension probing (client-side, best-effort) ─────
function probeImageDims(file) {
  return new Promise(resolve => {
    if (!file.type?.startsWith("image/")) return resolve({ width: null, height: null });
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// ── Main upload helper ─────────────────────────────────────
// Uploads a single file to Bunny at /media/YYYY/MM/<uniq>-<name>
// and writes a media_assets row with the provided metadata.
// Returns the inserted row (with cdn_url + id).
export async function uploadMedia(file, metadata = {}) {
  const { dir, filename } = buildStoragePath(file);
  const result = await bunnyUpload(file, dir, filename);
  const storagePath = `${dir}/${filename}`;
  const cdnUrl = result.cdnUrl || `${CDN_BASE}/${storagePath}`;

  const dims = await probeImageDims(file);

  const row = {
    file_name: file.name,
    mime_type: file.type || null,
    file_type: file.type || null,
    file_size: file.size || null,
    storage_path: storagePath,
    cdn_url: cdnUrl,
    file_url: cdnUrl,
    width: dims.width,
    height: dims.height,
    category: metadata.category || "general",
    tags: metadata.tags || [],
    publication_id: metadata.publicationId || null,
    story_id: metadata.storyId || null,
    client_id: metadata.clientId || null,
    sale_id: metadata.saleId || null,
    ad_project_id: metadata.adProjectId || null,
    legal_notice_id: metadata.legalNoticeId || null,
    uploaded_by: metadata.uploadedBy || null,
    alt_text: metadata.altText || null,
    caption: metadata.caption || null,
    notes: metadata.notes || null,
  };

  const { data, error } = await supabase
    .from("media_assets")
    .insert(row)
    .select()
    .single();

  if (error) {
    // Upload succeeded but DB write failed — surface both so we don't
    // silently create orphans on disk.
    console.error("media_assets insert failed:", error);
    throw new Error(`Upload succeeded but metadata insert failed: ${error.message}`);
  }
  return data;
}

// ── Parallel batch upload ──────────────────────────────────
// Uploads up to `concurrency` files simultaneously. Calls onProgress
// with (done, total) after each file, onEach with the resulting row,
// and onError with (file, error) for failures without stopping.
export async function uploadMediaBatch(files, metadata = {}, { concurrency = 3, onProgress, onEach, onError } = {}) {
  const queue = Array.from(files);
  const results = [];
  let done = 0;

  async function worker() {
    while (queue.length) {
      const file = queue.shift();
      try {
        const row = await uploadMedia(file, metadata);
        results.push(row);
        if (onEach) onEach(row, file);
      } catch (err) {
        if (onError) onError(file, err);
      }
      done++;
      if (onProgress) onProgress(done, files.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Delete helper that cleans both Bunny + media_assets ───
export async function deleteMedia(mediaAssetId) {
  const { data: row } = await supabase
    .from("media_assets")
    .select("storage_path, id")
    .eq("id", mediaAssetId)
    .single();
  if (!row?.storage_path) return;
  const parts = row.storage_path.split("/");
  const filename = parts.pop();
  const dir = parts.join("/");
  try { await bunnyDelete(dir, filename); } catch (e) { console.warn("Bunny delete failed:", e); }
  await supabase.from("media_assets").delete().eq("id", mediaAssetId);
}
