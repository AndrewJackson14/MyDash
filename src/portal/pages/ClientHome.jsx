// /c/<slug>/home — Phase D placeholder (spec §5.4). Real page
// renders quick actions, open items, recent-activity feed via
// get_client_activity RPC.
import { useParams } from "react-router-dom";
import Placeholder from "./Placeholder";
export default function ClientHome() {
  const { slug } = useParams();
  return <Placeholder title={`Client: ${slug}`} body="Home dashboard lands in Phase D." />;
}
