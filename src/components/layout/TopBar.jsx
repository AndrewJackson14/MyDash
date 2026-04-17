// ============================================================
// TopBar — subscribes to PageHeaderContext. Renders null until
// a page publishes a header. The full visual (search, avatar,
// keyboard hint) is wired here; pages control content via
//   const { setHeader } = usePageHeader();
//   useEffect(() => { setHeader({ breadcrumb, title, actions }); }, [...]);
// ============================================================
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { Z, FONT, RADII, DUR, EASE } from "../../lib/theme";
import Ic from "../ui/Icons";

export default function TopBar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  user,
  onUserClick,
  onHelpClick,
}) {
  const { header } = usePageHeader();
  if (!header) return null;

  const initials = user?.initials || (user?.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header
      data-shell="v2"
      style={{
        height: 64,
        background: Z.bgChrome,
        borderBottom: `1px solid ${Z.borderSubtle}`,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 24,
        position: "sticky",
        top: 0,
        zIndex: 30,
        fontFamily: FONT.sans,
      }}
    >
      {/* Breadcrumb */}
      {header.breadcrumb && header.breadcrumb.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {header.breadcrumb.map((c, i) => {
            const last = i === header.breadcrumb.length - 1;
            return (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {i > 0 && <span style={{ color: Z.borderStrong, fontSize: 12 }}>›</span>}
                <span
                  onClick={c.onClick}
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: last ? Z.fgPrimary : Z.fgMuted,
                    cursor: c.onClick ? "pointer" : "default",
                  }}
                >
                  {c.label}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Title */}
      {header.title && (
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: Z.fgPrimary,
            letterSpacing: "-0.02em",
            margin: 0,
            paddingLeft: header.breadcrumb?.length ? 16 : 0,
            marginLeft: header.breadcrumb?.length ? 8 : 0,
            borderLeft: header.breadcrumb?.length ? `1px solid ${Z.borderSubtle}` : "none",
            fontFamily: FONT.display,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {header.title}
        </h1>
      )}

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 480, marginLeft: "auto", position: "relative" }}>
        <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: Z.fgMuted, pointerEvents: "none", display: "flex" }}>
          <Ic.search size={14} />
        </div>
        <input
          type="text"
          value={searchValue || ""}
          onChange={onSearchChange ? (e) => onSearchChange(e.target.value) : undefined}
          onKeyDown={onSearchSubmit ? (e) => { if (e.key === "Enter") onSearchSubmit(e.currentTarget.value); } : undefined}
          placeholder="Search stories, clients, invoices…"
          style={{
            width: "100%",
            height: 36,
            padding: "0 12px 0 36px",
            background: Z.bgCanvas,
            border: `1px solid ${Z.borderSubtle}`,
            borderRadius: RADII.md,
            fontSize: 13,
            color: Z.fgPrimary,
            outline: "none",
            fontFamily: FONT.sans,
            transition: `border-color ${DUR.fast}ms ${EASE}, box-shadow ${DUR.fast}ms ${EASE}`,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#6787ae";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(72,107,149,0.12)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = Z.borderSubtle;
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <kbd
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10.5,
            fontWeight: 500,
            color: Z.fgMuted,
            padding: "3px 6px",
            background: Z.bgChrome,
            border: `1px solid ${Z.borderSubtle}`,
            borderRadius: RADII.xs,
            fontFamily: FONT.mono,
          }}
        >
          ⌘K
        </kbd>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {header.actions}
        {onHelpClick && (
          <button
            onClick={onHelpClick}
            title="Help"
            style={{
              width: 36, height: 36,
              borderRadius: RADII.md,
              border: "1px solid transparent",
              background: "transparent",
              color: Z.fgSecondary,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: `all ${DUR.fast}ms ${EASE}`,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>?</span>
          </button>
        )}
        {user && (
          <div
            onClick={onUserClick}
            title={user.name}
            style={{
              width: 32, height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #486b95, #2c465e)",
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "-0.01em",
              border: `2px solid ${Z.bgChrome}`,
              outline: `1px solid ${Z.borderSubtle}`,
              transition: `outline-color ${DUR.fast}ms ${EASE}`,
            }}
          >
            {initials}
          </div>
        )}
      </div>
    </header>
  );
}
