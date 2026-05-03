// /setup/complete?token=<uuid> — Phase C placeholder. Real
// implementation calls complete_portal_setup RPC and redirects
// to /c/<slug>/home (spec §5.3).
import Placeholder from "./Placeholder";
export default function SetupComplete() {
  return <Placeholder title="Finishing setup…" body="Token redemption lands in Phase C." />;
}
