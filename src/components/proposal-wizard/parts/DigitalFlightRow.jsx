// ============================================================
// DigitalFlightRow — single digital line editor
//
// Owns the auto-recalc dance:
//   - User edits start/end → recompute months from span
//   - User edits months    → recompute end date from start + months
//   - Any of product/months/dates → recompute price (unless user
//     manually edited price → customPrice flag flips on)
//
// Mirrors the existing logic at SalesCRM.jsx:512-534 so digital
// pricing stays consistent with the pre-wizard modal.
// ============================================================

import { Z, FS, FW, COND, Ri, R } from "../../../lib/theme";
import { Inp, Sel } from "../../ui/Primitives";
import Ic from "../../ui/Icons";

function digitalRateForMonths(product, months) {
  if (!product) return 0;
  const m = Number(months) || 1;
  if (m >= 12 && product.rate_12mo) return Number(product.rate_12mo) * m;
  if (m >= 6  && product.rate_6mo)  return Number(product.rate_6mo)  * m;
  return Number(product.rate_monthly || 0) * m;
}

function recalcMonths(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const ms = (new Date(endISO) - new Date(startISO)) / (30.44 * 86400000);
  return Math.max(1, Math.round(ms));
}

function recalcEndDate(startISO, months) {
  if (!startISO) return null;
  const start = new Date(startISO);
  start.setMonth(start.getMonth() + Number(months || 1));
  return start.toISOString().slice(0, 10);
}

export default function DigitalFlightRow({
  line,
  digitalAdProducts,
  pubs,
  errors = {},
  onUpdate,
  onRemove,
}) {
  const productsForPub = (digitalAdProducts || []).filter(p => p.pub_id === line.pubId);
  const product = productsForPub.find(p => p.id === line.digitalProductId);

  const patch = (next) => {
    // Cascading recalcs — keep months / end / price coherent without
    // making the reducer aware of digitalAdProducts.
    if (next.flightStartDate !== undefined || next.flightEndDate !== undefined) {
      const s = next.flightStartDate !== undefined ? next.flightStartDate : line.flightStartDate;
      const e = next.flightEndDate   !== undefined ? next.flightEndDate   : line.flightEndDate;
      const m = recalcMonths(s, e);
      if (m) next.flightMonths = m;
    }
    if (next.flightMonths !== undefined && (next.flightStartDate || line.flightStartDate)) {
      const s = next.flightStartDate || line.flightStartDate;
      const end = recalcEndDate(s, next.flightMonths);
      if (end) next.flightEndDate = end;
    }
    const recomputePrice =
      !line.customPrice &&
      (next.digitalProductId !== undefined ||
       next.flightMonths     !== undefined ||
       next.flightStartDate  !== undefined ||
       next.flightEndDate    !== undefined);
    if (recomputePrice) {
      const productNext = next.digitalProductId !== undefined
        ? productsForPub.find(p => p.id === next.digitalProductId)
        : product;
      const monthsNext = next.flightMonths !== undefined ? next.flightMonths : line.flightMonths;
      next.price = digitalRateForMonths(productNext, monthsNext);
    }
    if (next.price !== undefined) next.customPrice = true;
    onUpdate(line.id, next);
  };

  const hasErr = !!(errors[`digitalProduct:${line.id}`] || errors[`flightStart:${line.id}`] ||
                    errors[`flightEnd:${line.id}`]      || errors[`flightRange:${line.id}`]);

  return (
    <div style={{
      background: Z.sa, borderRadius: R,
      border: `1px solid ${hasErr ? Z.da : Z.bd}`,
      padding: 12,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr 1fr 0.7fr 1fr 28px",
        gap: 8, alignItems: "end",
      }}>
        <Sel
          label="Product"
          value={line.digitalProductId}
          onChange={e => patch({ digitalProductId: e.target.value })}
          options={[
            { value: "", label: productsForPub.length ? "— Select product —" : "(no products for this pub)" },
            ...productsForPub.map(p => ({
              value: p.id,
              label: `${p.name} ($${Number(p.rate_monthly).toLocaleString()}/mo)`,
            })),
          ]}
        />
        <Inp
          label="Start"
          type="date"
          value={line.flightStartDate}
          onChange={e => patch({ flightStartDate: e.target.value })}
        />
        <Inp
          label="End"
          type="date"
          value={line.flightEndDate}
          onChange={e => patch({ flightEndDate: e.target.value })}
        />
        <Inp
          label="Months"
          type="number"
          value={line.flightMonths}
          onChange={e => patch({ flightMonths: Number(e.target.value) || 1 })}
        />
        <Inp
          label="Price"
          type="number"
          value={line.price}
          onChange={e => patch({ price: Number(e.target.value) || 0 })}
        />
        <button
          onClick={() => onRemove(line.id)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: Z.da, fontSize: 18, fontWeight: 900,
            alignSelf: "end", padding: "8px 0",
          }}
          aria-label="Remove digital line"
        >×</button>
      </div>

      {/* Inline subtotal hint */}
      {product && (
        <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
          Auto-rate: ${digitalRateForMonths(product, line.flightMonths).toLocaleString()}
          {line.customPrice && line.price !== digitalRateForMonths(product, line.flightMonths) && (
            <> · <span style={{ color: Z.wa, fontWeight: FW.bold }}>custom price</span></>
          )}
        </div>
      )}

      {/* Per-line errors */}
      {hasErr && (
        <div style={{ fontSize: 11, color: Z.da, fontFamily: COND, fontWeight: FW.bold }}>
          {[errors[`digitalProduct:${line.id}`],
            errors[`flightStart:${line.id}`],
            errors[`flightEnd:${line.id}`],
            errors[`flightRange:${line.id}`]].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}
