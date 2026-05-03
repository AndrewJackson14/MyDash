// Customer portal entry — mounts at portal.13stars.media.
// Independent bundle from the staff app (mydash.media); built via
// vite.config.portal.js → dist-portal/. Shares the same Supabase
// project and the same lib/supabase client.
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import PortalApp from "./PortalApp";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <PortalApp />
    </BrowserRouter>
  </React.StrictMode>
);
