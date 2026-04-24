// ============================================================
// pdfRender — shared pdf.js helpers for rasterising PDF page 1 to
// a JPEG Blob in the browser.
//
// Used by:
//  - EditionManager (newspaper edition cover thumbnail)
//  - PageLayoutModal in Flatplan (publisher's layout reference)
//
// Reuses the global pdf.js singleton so multiple callers share a
// single worker + WASM init cost.
// ============================================================

let _pdfjsReady = null;
async function getPdfjs() {
  if (_pdfjsReady) return _pdfjsReady;
  const pdfjsLib = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  _pdfjsReady = pdfjsLib;
  return pdfjsLib;
}

async function openPdf(data) {
  const pdfjsLib = await getPdfjs();
  const cMapUrl = await import("pdfjs-dist/cmaps/78-H.bcmap?url").then(m => {
    const url = m.default;
    return url.substring(0, url.lastIndexOf("/") + 1);
  });
  const standardFontDataUrl = await import("pdfjs-dist/standard_fonts/FoxitFixed.pfb?url").then(m => {
    const url = m.default;
    return url.substring(0, url.lastIndexOf("/") + 1);
  });
  return pdfjsLib.getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
    wasmUrl: "/pdfjs-wasm/",
    isEvalSupported: false,
  }).promise;
}

// Render PDF page 1 from a File/Blob → JPEG Blob at the requested
// long-edge size (default 1200px). Returns { blob, width, height,
// numPages }. Falls back to throwing on render failure so the caller
// can surface the error to the user.
export async function rasterizePdfFirstPage(file, longEdgePx = 1200, quality = 0.86) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await openPdf(new Uint8Array(arrayBuffer));
  const page = await pdf.getPage(1);
  // Compute scale so the long edge lands at longEdgePx.
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = longEdgePx / Math.max(baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  return { blob, width: canvas.width, height: canvas.height, numPages: pdf.numPages };
}
