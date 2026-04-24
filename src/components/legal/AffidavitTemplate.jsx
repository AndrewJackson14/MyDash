// ============================================================
// AffidavitTemplate — single React component that renders all 8
// certification-of-publication variants from one source of truth.
//
// Variants vary by:
//   - state/county pair (SLO vs LA)
//   - publication line (PRP+ATN vs TMT)
//   - city of execution (Atascadero vs Malibu)
//   - signatory caption (Cami's PRP+ATN block vs TMT block)
//
// All derived in legalFormats.getAffidavitConfig.
//
// Pages render at 1:1 print scale (816 × 1056 px @ 96 DPI = 8.5 × 11
// inches). The workspace shrinks visually with CSS transform; the
// internal coordinate system stays in print pixels so html2canvas
// can rasterize at scale=3 without resampling artifacts.
// ============================================================
import { forwardRef } from "react";
import { getAffidavitConfig } from "../../lib/legalFormats";

const PAGE_W = 816;   // 8.5" × 96 DPI
const PAGE_H = 1056;  // 11"  × 96 DPI

// First page — full template (header + two-column body + signature
// block). Continuation pages use ContinuationPage below.
function CertificationPage({ config, clips, onClipMouseDown }) {
  return (
    <div
      data-affidavit-page="1"
      style={{
        width: PAGE_W, height: PAGE_H,
        background: "#fff", color: "#111",
        position: "relative",
        fontFamily: "Helvetica, Arial, sans-serif",
        boxSizing: "border-box",
        padding: "0.6in 0.6in",
      }}
    >
      <div style={{ textAlign: "center", fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 18 }}>
        CERTIFICATION OF PUBLICATION
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        {/* LEFT COLUMN — attestation + signature block */}
        <div style={{ width: "45%", paddingRight: 14, fontSize: 11, lineHeight: 1.4 }}>
          <div style={{ marginBottom: 10 }}>
            STATE OF {config.state}<br />
            COUNTY OF {config.county}
          </div>

          <div style={{ marginBottom: 10 }}>
            I am a citizen of the United States and a resident of the County aforesaid;
            I am over the age of eighteen years, and not a party to or interested in the
            above-entitled matter.  I am the principal clerk of the printer of{" "}
            <strong>{config.pubLine}</strong>, a newspaper of general circulation, printed and
            published in the City of {config.city}, County of {config.county}, State of
            California; and that the notice, of which the annexed is a printed copy
            (set in type not smaller than nonpareil), has been published in each
            regular and entire issue of said newspaper and not in any supplement thereof
            on the following dates, to-wit:
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>LEGAL NOTICE</div>
            <div style={{ marginTop: 4 }}>{config.legalLabel}</div>
            {config.legalBody && <div style={{ marginTop: 2, fontStyle: "italic" }}>{config.legalBody}</div>}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Dates Published:</div>
            <div>{config.datesPublished}</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            I certify (or declare) under penalty of perjury that the foregoing is true
            and correct.
          </div>

          <div style={{ marginBottom: 4 }}>
            Executed on {config.executedOn}
          </div>
          <div style={{ marginBottom: 12 }}>
            In {config.city}, California
          </div>

          {config.signatureUrl && (
            <img
              src={config.signatureUrl}
              alt="Signature"
              crossOrigin="anonymous"
              style={{ width: 120, height: "auto", display: "block", marginBottom: 4 }}
            />
          )}
          <div style={{ borderTop: "1px solid #111", width: 220, marginBottom: 4 }} />
          <div style={{ fontSize: 10 }}>
            {config.signatureCaption.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>

        {/* Vertical rule */}
        <div style={{ width: 1, background: "#111" }} />

        {/* RIGHT COLUMN — clip drop zone */}
        <div data-affidavit-clip-zone="1" style={{ position: "relative", flex: 1, paddingLeft: 14, minHeight: 800 }}>
          {clips.map((c) => (
            <img
              key={c.id}
              src={c.clipping_cdn_url}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
              onMouseDown={onClipMouseDown ? (e) => onClipMouseDown(e, c) : undefined}
              style={{
                position: "absolute",
                left: Number(c.canvas_x) || 0,
                top: Number(c.canvas_y) || 0,
                width: Number(c.canvas_w) || 320,
                height: "auto",
                cursor: onClipMouseDown ? "grab" : "default",
                outline: onClipMouseDown ? "1px dashed rgba(75,139,245,0.4)" : "none",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ContinuationPage({ pageNumber, totalPages, clips, onClipMouseDown }) {
  return (
    <div
      data-affidavit-page={pageNumber}
      style={{
        width: PAGE_W, height: PAGE_H,
        background: "#fff", color: "#111",
        position: "relative",
        fontFamily: "Helvetica, Arial, sans-serif",
        boxSizing: "border-box",
        padding: "0.6in 0.6in",
      }}
    >
      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
        CERTIFICATION OF PUBLICATION — continued
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: "#444", marginBottom: 16 }}>
        Page {pageNumber} of {totalPages}
      </div>
      <div data-affidavit-clip-zone={pageNumber} style={{ position: "relative", minHeight: 920 }}>
        {clips.map((c) => (
          <img
            key={c.id}
            src={c.clipping_cdn_url}
            alt=""
            crossOrigin="anonymous"
            draggable={false}
            onMouseDown={onClipMouseDown ? (e) => onClipMouseDown(e, c) : undefined}
            style={{
              position: "absolute",
              left: Number(c.canvas_x) || 0,
              top: Number(c.canvas_y) || 0,
              width: Number(c.canvas_w) || 320,
              height: "auto",
              cursor: onClipMouseDown ? "grab" : "default",
              outline: onClipMouseDown ? "1px dashed rgba(75,139,245,0.4)" : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// AffidavitTemplate — render N pages. The hosting workspace passes:
//   - notice, publication, signatureUrl  (drives the cert content)
//   - clipsByPage  (Map<pageNumber, clip[]>) — placed clips per page
//   - pageCount    (>= 1)
//   - registerPageRef(pageNumber, el) — so the lock action can find
//     the DOM nodes for html2canvas
const AffidavitTemplate = forwardRef(function AffidavitTemplate({
  notice,
  publication,
  signatureUrl,
  clipsByPage,
  pageCount,
  registerPageRef,
  onClipMouseDown,    // (event, clip) => void — workspace passes a drag handler so each <img> is grabbable
}, ref) {
  const config = getAffidavitConfig(notice, publication, signatureUrl);
  const total = Math.max(1, pageCount || 1);
  const pages = [];
  for (let i = 1; i <= total; i++) {
    const clips = clipsByPage?.get?.(i) || [];
    pages.push(
      <div
        key={i}
        ref={(el) => registerPageRef?.(i, el)}
        style={{ marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}
      >
        {i === 1
          ? <CertificationPage config={config} clips={clips} onClipMouseDown={onClipMouseDown} />
          : <ContinuationPage pageNumber={i} totalPages={total} clips={clips} onClipMouseDown={onClipMouseDown} />
        }
      </div>
    );
  }
  return <div ref={ref}>{pages}</div>;
});

export default AffidavitTemplate;
export { PAGE_W, PAGE_H };
