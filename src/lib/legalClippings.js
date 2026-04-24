// ============================================================
// legalClippings — client-side source freeze + crop pipeline.
//
// Crops happen client-side (canvas). Uploads go through the existing
// upload-image edge function with custom paths under
// legal-clippings/{notice_id}/. DB writes hit legal_notice_clippings
// directly via PostgREST (RLS allows authenticated team members).
//
// Source freeze:
//   First crop on a (notice, run_date, page) downloads the source
//   page WebP from CDN and re-uploads it under
//   legal-clippings/{notice_id}/source/{run_date}-p{N}.webp. Cami's
//   crops are always taken from the frozen copy, so a future press
//   PDF replacement doesn't invalidate them.
// ============================================================
import { supabase } from "./supabase";
import {
  editionPageImageUrl,
  legalSourceFrozenPath,
  legalClipPath,
} from "./legalFormats";

const UPLOAD_FN = "/functions/v1/upload-image";

async function postToUploadImage(blob, { uploadPath, fileName, contentType }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token || "";
  const apiKey = supabase.supabaseKey || "";
  const url = `${supabase.supabaseUrl}${UPLOAD_FN}`;
  const arrayBuf = await blob.arrayBuffer();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { apikey: apiKey } : {}),
      "x-upload-path": uploadPath,
      "x-file-name": fileName,
      "x-content-type": contentType,
    },
    body: arrayBuf,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || `upload-image ${res.status}`);
  return out; // { url, path, size }
}

// Fetch the source page WebP from the public CDN and re-upload it
// under the notice's frozen-source path. Returns the frozen URL.
// Idempotent — caller checks for an existing frozen URL before
// calling so we don't burn bandwidth re-freezing the same page.
export async function freezeSourcePage(noticeId, edition, pageNumber, runDate) {
  const sourceUrl = editionPageImageUrl(edition, pageNumber);
  if (!sourceUrl) throw new Error("Edition has no page-images base URL");
  const res = await fetch(sourceUrl, { credentials: "omit" });
  if (!res.ok) throw new Error(`Source page fetch failed: ${res.status}`);
  const blob = await res.blob();
  const fullPath = legalSourceFrozenPath(noticeId, runDate, pageNumber);
  // upload-image takes a folder via x-upload-path and a file name via
  // x-file-name. Split our canonical path back into those two pieces.
  const lastSlash = fullPath.lastIndexOf("/");
  const folder = fullPath.slice(0, lastSlash);
  const file = fullPath.slice(lastSlash + 1);
  const out = await postToUploadImage(blob, { uploadPath: folder, fileName: file, contentType: blob.type || "image/webp" });
  return out.url;
}

// Crop the source page entirely client-side and upload the cropped
// JPEG. Crop bounds are fractions of the source (0..1) so they
// survive page-image rescales / re-renders.
export async function cropAndUploadClip({
  noticeId,
  sourceUrl,        // frozen source page URL
  cropBounds,       // { x, y, w, h } in 0..1 fractions
  quality = 0.92,
}) {
  const img = await loadImage(sourceUrl);
  const cx = Math.round(cropBounds.x * img.naturalWidth);
  const cy = Math.round(cropBounds.y * img.naturalHeight);
  const cw = Math.round(cropBounds.w * img.naturalWidth);
  const ch = Math.round(cropBounds.h * img.naturalHeight);
  if (cw <= 0 || ch <= 0) throw new Error("Crop bounds are empty");

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Canvas toBlob failed");

  const fileName = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const fullPath = legalClipPath(noticeId, fileName);
  const lastSlash = fullPath.lastIndexOf("/");
  const folder = fullPath.slice(0, lastSlash);
  const file = fullPath.slice(lastSlash + 1);
  const out = await postToUploadImage(blob, { uploadPath: folder, fileName: file, contentType: "image/jpeg" });
  return { cdn_url: out.url, bunny_path: out.path, width: cw, height: ch, byte_size: out.size };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Image load failed: " + (e?.message || src)));
    img.src = src;
  });
}

// Persist a clip row + return the inserted record. Caller passes the
// crop bounds (used for re-crop UX), the frozen source URL (for
// rebuild after press-PDF replacement), the resulting CDN url, and
// optional canvas placement.
export async function insertClipping({
  legal_notice_id,
  run_date,
  edition_id,
  source_page_number,
  source_frozen_url,
  cropBounds,
  clipping_cdn_url,
  canvas_page = 1,
  canvas_x = null,
  canvas_y = null,
  canvas_w = null,
  clip_order = 0,
  created_by = null,
}) {
  const { data, error } = await supabase
    .from("legal_notice_clippings")
    .insert({
      legal_notice_id,
      run_date,
      edition_id: edition_id || null,
      source_page_number,
      source_frozen_url,
      crop_x: cropBounds.x,
      crop_y: cropBounds.y,
      crop_w: cropBounds.w,
      crop_h: cropBounds.h,
      clipping_cdn_url,
      canvas_page,
      canvas_x,
      canvas_y,
      canvas_w,
      clip_order,
      created_by,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadClippings(legal_notice_id) {
  const { data, error } = await supabase
    .from("legal_notice_clippings")
    .select("*")
    .eq("legal_notice_id", legal_notice_id)
    .order("clip_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateClippingPlacement(id, patch) {
  const { error } = await supabase.from("legal_notice_clippings").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteClipping(id) {
  const { error } = await supabase.from("legal_notice_clippings").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
