// KBLink — small inline link that deep-links into the role KB viewer.
//
// Drop anywhere in MyDash to point users at the relevant docs:
//
//   <KBLink role="sales-rep" anchor="contract-conversion">
//     How does conversion work?
//   </KBLink>
//
// Uses App.jsx's onNavigate path-router. Path shape:
//   /rolekb?role=<slug>#<anchor>
// App.jsx parses the query into `deepLink` and the page module reads
// it to switch to the right doc + scroll to the heading.

import { Z, COND, FW, FS } from "../lib/theme";
import { useNav } from "../hooks/useNav";

export default function KBLink({ role, anchor, children, onNavigate, style }) {
  const nav = useNav(onNavigate);

  // useNav.toPath gives a curried handler. Compose the URL ourselves
  // since the existing helpers don't include rolekb yet.
  const handle = () => {
    if (!onNavigate) return;
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    const qs = params.toString();
    const path = `/rolekb${qs ? "?" + qs : ""}${anchor ? "#" + anchor : ""}`;
    onNavigate(path);
  };

  return (
    <button
      type="button"
      onClick={handle}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        color: Z.ac,
        textDecoration: "underline",
        textDecorationStyle: "dotted",
        textUnderlineOffset: 3,
        cursor: "pointer",
        fontFamily: COND,
        fontWeight: FW.semi,
        fontSize: FS.sm,
        ...style,
      }}
    >
      {children || "Learn more"}
    </button>
  );
}
