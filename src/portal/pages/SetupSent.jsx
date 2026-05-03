// /setup/sent — Phase C placeholder. Confirmation landing after the
// self-serve submit handler dispatches the magic-link email
// (spec §9.3).
import Placeholder from "./Placeholder";
export default function SetupSent() {
  return <Placeholder title="Check your email" body="We sent you a sign-in link. Phase C will polish this page." />;
}
