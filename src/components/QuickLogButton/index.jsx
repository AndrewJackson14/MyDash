// QuickLogButton — floating ⌘+L launcher.
//
// Floating bottom-right button + modal that lets sales reps log phone
// calls and office admins log ad-hoc tasks/help without pulling out a
// full record. Both forms write to activity_log via the log_activity
// RPC, with role-aware event_type / event_category metadata.
//
// Visible on every authenticated MyDash page once mounted at App-root.
// Form selection follows currentUser.role:
//   Salesperson / Sales Manager → SalesCallForm (phone_call_logged)
//   Office Manager / Administrator → OfficeAdminForm (helped_team_member or manual_task_logged)
// Other roles see a generic "comment" entry — keeps the affordance
// universal but unobtrusive.

import { lazy, Suspense, useEffect, useState } from "react";
import { Z, FW } from "../../lib/theme";

const QuickLogModal = lazy(() => import("./QuickLogModal"));

const SALES_ROLES   = ["Salesperson", "Sales Manager"];
const OFFICE_ROLES  = ["Office Manager", "Office Administrator", "Finance"];

export default function QuickLogButton({ currentUser }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      // ⌘L (Mac) / Ctrl+L (Windows) — open quick log.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        // Don't hijack the address bar focus shortcut while typing.
        const t = e.target?.tagName;
        if (t === "INPUT" || t === "TEXTAREA" || e.target?.isContentEditable) return;
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!currentUser) return null;
  const role = currentUser.role || "";
  const formKind = SALES_ROLES.includes(role) ? "sales_call"
    : OFFICE_ROLES.includes(role) ? "office_admin"
    : "comment";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Quick log (⌘L)"
        aria-label="Quick log"
        style={{
          position: "fixed",
          bottom: 88,
          right: 24,
          width: 52, height: 52,
          borderRadius: 26,
          background: Z.ac,
          color: Z.bg,
          border: "none",
          boxShadow: "0 8px 24px -8px rgba(0,0,0,0.3), 0 4px 8px -4px rgba(0,0,0,0.2)",
          cursor: "pointer",
          fontSize: 22,
          fontWeight: FW.bold,
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 90,
        }}
      >
        ✏︎
      </button>

      {open && (
        <Suspense fallback={null}>
          <QuickLogModal
            kind={formKind}
            currentUser={currentUser}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
