import { Z } from "../lib/theme";
import { Modal } from "./ui";
import MediaLibrary from "../pages/MediaLibrary";

export default function MediaModal({ open, onClose, onSelect, pubs, pubFilter }) {
  if (!open) return null;

  const handleSelect = (asset) => {
    onSelect({
      url: asset.url,
      alt: "",
      caption: "",
      fileName: asset.fileName,
    });
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "90vw", maxWidth: 1100, height: "80vh",
        background: Z.bg, borderRadius: 8, border: "1px solid " + Z.bd,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: "1px solid " + Z.bd, flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: Z.tx }}>Select Media</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 18 }}>{"\u00d7"}</button>
        </div>
        {/* Library */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <MediaLibrary pubs={pubs} embedded onSelect={handleSelect} pubFilter={pubFilter} />
        </div>
      </div>
    </div>
  );
}
