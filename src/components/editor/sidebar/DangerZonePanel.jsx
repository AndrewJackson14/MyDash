import React from "react";
import { Z } from "../../../lib/theme";
import { Btn } from "../../ui";

function DangerZonePanel({ onDelete }) {
  return (
    <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
      <Btn sm v="danger" style={{ width: "100%" }} onClick={onDelete}>Delete Story</Btn>
    </div>
  );
}

export default React.memo(DangerZonePanel);
