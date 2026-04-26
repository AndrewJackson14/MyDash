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

// bunny-storage runs with verify_jwt:true. Supabase's gateway requires
// BOTH an apikey (anon key) AND an Authorization (user JWT) header on
// every request. functions.invoke() was returning 401 on GET/DELETE via
// this project for reasons we couldn't pin down — EditionManager's raw
// XHR path with explicit headers works reliably, so mirror that here.
async function bunnyAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not signed in — please refresh and sign in again");
  return {
    apikey: supabase.supabaseKey || "",
    Authorization: "Bearer " + token,
  };
}

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
  const auth = await bunnyAuthHeaders();
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": file.type || "application/octet-stream",
      "x-action": "upload",
      "x-path": dir,
      "x-filename": encodeURIComponent(filename),
    },
    body: file,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${txt || res.statusText}`);
  }
  return res.json();
}

export async function bunnyDelete(dir, filename) {
  const auth = await bunnyAuthHeaders();
  const res = await fetch(PROXY_URL, {
    method: "DELETE",
    headers: {
      ...auth,
      "x-action": "delete",
      "x-path": dir,
      "x-filename": encodeURIComponent(filename),
    },
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Delete failed (${res.status}): ${txt || res.statusText}`);
  }
}

export async function bunnyList(path) {
  const auth = await bunnyAuthHeaders();
  const res = await fetch(PROXY_URL, {
    method: "GET",
    headers: {
      ...auth,
      "x-action": "list",
      "x-path": path || "",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`List failed (${res.status}): ${txt || res.statusText}`);
  }
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

// Load a file into an HTMLImageElement so we can draw it to canvas.
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

// ── Image compression / resize (client-side) ───────────────
// Keeps the CDN from filling up with 12 MP phone photos. Targets
// 2000 px max width + <500 KB. Only touches raster formats; SVG and
// GIF pass through unchanged (vector / possibly-animated).
//
// Passes verbatim if the source is already within both thresholds —
// no re-encode cost and no quality loss for already-optimized images.
//
// PNG sources get converted to JPEG as part of the re-encode when a
// resize is needed. That's fine for photographic content (which is
// most of what goes into stories) but strips alpha; if you're ever
// routing logos through this helper, pass `skipCompress: true` in
// the metadata to uploadMedia.
export async function compressImageIfLarge(file, {
  maxWidth = 2000,
  targetBytes = 500 * 1024,
  minQuality = 0.5,
  grayscale = false,
  forceRecode = false,
  suffix = "",
} = {}) {
  if (!file?.type?.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  let img;
  try { img = await loadImageFromFile(file); }
  catch { return file; }   // unreadable — let upload layer handle it

  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const needsResize = srcW > maxWidth;
  const needsRecompress = file.size > targetBytes;
  if (!needsResize && !needsRecompress && !grayscale && !forceRecode) return file;

  const scale = needsResize ? maxWidth / srcW : 1;
  const outW = Math.round(srcW * scale);
  const outH = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, outW, outH);

  // Luminance-weighted greyscale (Rec. 601) before encode — for obits,
  // prints correctly on B&W pages.
  if (grayscale) {
    const d = ctx.getImageData(0, 0, outW, outH);
    for (let i = 0; i < d.data.length; i += 4) {
      const g = Math.round(0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]);
      d.data[i] = g; d.data[i + 1] = g; d.data[i + 2] = g;
    }
    ctx.putImageData(d, 0, 0);
  }

  // Iteratively lower JPEG quality until we hit the target size.
  let quality = 0.85;
  let blob = await canvasToBlob(canvas, "image/jpeg", quality);
  while (blob && blob.size > targetBytes && quality > minQuality) {
    quality = Math.max(minQuality, quality - 0.1);
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
  }
  if (!blob) return file;

  if (blob.size >= file.size && !needsResize && !grayscale && !forceRecode) return file;

  canvas.width = 1; canvas.height = 1;

  const baseName = file.name.replace(/\.(png|webp|jpe?g|bmp|heic|avif|tiff?)$/i, "");
  return new File([blob], baseName + (suffix || "") + ".jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

// ── Greyscale conversion (client-side) ──────────────────────
// Used for obituary photos, which print in B&W. Uses luminance-
// weighted greyscale (Rec. 601: 0.299R + 0.587G + 0.114B) for a
// perceptually accurate result — closer to what a print press would
// produce than a naive average. Output is JPEG; filename picks up a
// "-bw" suffix so the Media Library still surfaces the source file.
export async function convertToGreyscale(file, { quality = 0.9 } = {}) {
  if (!file?.type?.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  let img;
  try { img = await loadImageFromFile(file); }
  catch { return file; }

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray; data[i + 1] = gray; data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  if (!blob) return file;

  canvas.width = 1; canvas.height = 1;

  const baseName = file.name.replace(/\.(png|webp|jpe?g|bmp|heic|avif|tiff?)$/i, "");
  return new File([blob], baseName + "-bw.jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

// ── Size thresholds ────────────────────────────────────────
const SKIP_COMPRESS_BYTES = 200 * 1024;        // <200 KB → don't touch
const ORIGINAL_CAP_BYTES  = 8 * 1024 * 1024;   // 8 MB max for "original" variant
const THUMBNAIL_MAX_WIDTH = 400;
const THUMBNAIL_TARGET_BYTES = 60 * 1024;

// Build a distinct filename in a sibling folder. Keeps the uniq prefix
// consistent across the three variants so you can eyeball related files.
function variantPath(basePath, folder) {
  const parts = basePath.split("/");
  const filename = parts.pop();
  const year = parts[parts.length - 2];
  const month = parts[parts.length - 1];
  return { dir: `${folder}/${year}/${month}`, filename };
}

// ── Main upload helper ─────────────────────────────────────
// Uploads a single image to Bunny as THREE variants:
//   1. /media/YYYY/MM/…       reduced main (2000 px / 500 KB, grayscale
//                              if obituary) — this is the cdn_url.
//   2. /originals/YYYY/MM/…   untouched source, capped at 8 MB. Used by
//                              "Download Originals" in Story Editor.
//   3. /thumbnails/YYYY/MM/…  ~400 px wide thumbnail for list UIs.
// Writes a media_assets row with all three URLs. Non-image files skip
// the variant logic and upload once to /media/.
//
// Guards:
// - Files <200 KB skip the main-variant resize (no point re-encoding
//   an already-small asset).
// - Story uploads require a publication_id: the error message is what
//   the UI surfaces to the user.
// - Obituary category/story_type → all three variants go grayscale so
//   the print + web + thumbnail stay consistent.
export async function uploadMedia(file, metadata = {}) {
  // Publication guard — applies only to story-attached uploads. Other
  // surfaces (client profile, ad projects) may legitimately lack a pub.
  if (metadata.storyId && !metadata.publicationId) {
    throw new Error("Please choose a publication first.");
  }

  const isImage = !!file?.type?.startsWith("image/")
    && file.type !== "image/svg+xml"
    && file.type !== "image/gif";
  const grayscale = !metadata.skipGreyscale &&
    (metadata.category === "obituary" || metadata.storyType === "obituary");

  // Non-image (or vector/gif) → original legacy path, single upload.
  if (!isImage || metadata.skipCompress) {
    const { dir, filename } = buildStoragePath(file);
    const result = await bunnyUpload(file, dir, filename);
    const storagePath = `${dir}/${filename}`;
    const cdnUrl = result.cdnUrl || `${CDN_BASE}/${storagePath}`;
    return insertMediaRow({
      file, uploadFile: file, storagePath, cdnUrl,
      originalUrl: cdnUrl, thumbnailUrl: cdnUrl, metadata,
    });
  }

  // ─── 3-variant image upload ────────────────────────────
  // Main variant: 2000 px / 500 KB. Files <200 KB bypass the recode
  // unless grayscale is needed (obits must still be desaturated).
  const skipMainResize = file.size < SKIP_COMPRESS_BYTES && !grayscale;
  const mainFile = skipMainResize
    ? file
    : await compressImageIfLarge(file, { grayscale });

  // Original variant: keep bytes as-is if under the 8 MB cap, otherwise
  // scale down to fit while preserving the highest resolution we can.
  let originalFile = file;
  if (file.size > ORIGINAL_CAP_BYTES || grayscale) {
    originalFile = await compressImageIfLarge(file, {
      maxWidth: 4000,
      targetBytes: ORIGINAL_CAP_BYTES,
      minQuality: 0.7,
      grayscale,
      forceRecode: grayscale,
      suffix: grayscale ? "-bw" : "",
    });
  }

  // Thumbnail variant: tiny JPEG for grid UIs.
  const thumbFile = await compressImageIfLarge(file, {
    maxWidth: THUMBNAIL_MAX_WIDTH,
    targetBytes: THUMBNAIL_TARGET_BYTES,
    minQuality: 0.6,
    grayscale,
    forceRecode: true,
    suffix: "-thumb",
  });

  // Use the main file's path as the canonical location; derive the two
  // sibling paths from it so all three share the same uniq prefix.
  const { dir: mainDir, filename: mainName } = buildStoragePath(mainFile);
  const mainStorage = `${mainDir}/${mainName}`;
  const origVariant  = variantPath(mainStorage, "originals");
  const thumbVariant = variantPath(mainStorage, "thumbnails");

  // Fire all three uploads in parallel.
  const [mainRes, origRes, thumbRes] = await Promise.all([
    bunnyUpload(mainFile,     mainDir,           mainName),
    bunnyUpload(originalFile, origVariant.dir,   origVariant.filename),
    bunnyUpload(thumbFile,    thumbVariant.dir,  thumbVariant.filename),
  ]);

  const cdnUrl       = mainRes.cdnUrl  || `${CDN_BASE}/${mainStorage}`;
  const originalUrl  = origRes.cdnUrl  || `${CDN_BASE}/${origVariant.dir}/${origVariant.filename}`;
  const thumbnailUrl = thumbRes.cdnUrl || `${CDN_BASE}/${thumbVariant.dir}/${thumbVariant.filename}`;

  return insertMediaRow({
    file, uploadFile: mainFile, storagePath: mainStorage,
    cdnUrl, originalUrl, thumbnailUrl, metadata,
  });
}

async function insertMediaRow({ file, uploadFile, storagePath, cdnUrl, originalUrl, thumbnailUrl, metadata }) {
  const dims = await probeImageDims(uploadFile);
  const row = {
    file_name: uploadFile.name,
    mime_type: uploadFile.type || null,
    file_type: uploadFile.type || null,
    file_size: uploadFile.size || null,
    storage_path: storagePath,
    cdn_url: cdnUrl,
    file_url: cdnUrl,
    original_url: originalUrl,
    thumbnail_url: thumbnailUrl,
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
    source_proposal_id: metadata.sourceProposalId || null,
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
