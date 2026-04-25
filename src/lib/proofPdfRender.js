// ============================================================
// proofPdfRender — Anthony Phase 4 multi-page PDF render helpers
// for the Issue Proofing tab. Reuses pdfRender.js's pdf.js singleton
// so we share one worker across the app, but adds a streaming
// multi-page renderer + a render-to-canvas helper that the proofing
// UI uses to draw pages with click-to-pin annotation overlays.
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

// Open a PDF from a URL. Returns the pdf.js document handle (which has
// numPages + getPage). Caller should hold onto it for the lifetime of
// the viewer to avoid re-parsing on every render.
export async function loadProofPdf(url) {
  const pdfjsLib = await getPdfjs();
  const cMapUrl = await import("pdfjs-dist/cmaps/78-H.bcmap?url").then(m => {
    const u = m.default;
    return u.substring(0, u.lastIndexOf("/") + 1);
  });
  const standardFontDataUrl = await import("pdfjs-dist/standard_fonts/FoxitFixed.pfb?url").then(m => {
    const u = m.default;
    return u.substring(0, u.lastIndexOf("/") + 1);
  });
  return pdfjsLib.getDocument({
    url,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
    wasmUrl: "/pdfjs-wasm/",
    isEvalSupported: false,
  }).promise;
}

// Render a single page into the supplied canvas at the requested
// width. Returns { width, height } of the rendered viewport so the
// caller can size annotation overlays in matching pixel space.
export async function renderPageToCanvas(pdf, pageNum, canvas, targetWidth = 800) {
  const page = await pdf.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });
  const dpr = window.devicePixelRatio || 1;
  canvas.width = viewport.width * dpr;
  canvas.height = viewport.height * dpr;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { width: viewport.width, height: viewport.height, numPages: pdf.numPages };
}
