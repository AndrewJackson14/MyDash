// ============================================================
// Proposal Wizard — Pure validation per step
//
// Returns { valid, errors }. Errors are field-keyed strings the UI
// surfaces inline. Step bar / footer Next button consume `valid`
// for soft validation (steps 1-6) and hard validation (Step 7).
// ============================================================

import { PAY_TIMINGS, CHARGE_DAYS, DELIVERY_CADENCES, ART_SOURCES } from "./proposalWizardConstants";

export function hasAnyPrintFormat(state) {
  return state.pubs.some(p => p.formats?.print);
}

export function hasAnyDigitalFormat(state) {
  return state.pubs.some(p => p.formats?.digital);
}

export function validateStep1(state) {
  const errors = {};
  if (!state.clientId) errors.clientId = "Pick a client to continue";
  if (!state.proposalName?.trim()) errors.proposalName = "Proposal needs a name";
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep2(state) {
  const errors = {};
  if (state.pubs.length === 0) {
    errors.pubs = "Add at least one publication";
  } else {
    state.pubs.forEach(p => {
      if (!p.formats?.print && !p.formats?.digital) {
        errors[`pub:${p.pubId}`] = "Pick print, digital, or both";
      }
    });
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep3(state) {
  const errors = {};
  state.pubs.filter(p => p.formats?.print).forEach(p => {
    const issues = state.issuesByPub[p.pubId] || [];
    if (issues.length === 0) {
      errors[`issues:${p.pubId}`] = "Pick at least one issue";
    }
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep4(state) {
  const errors = {};
  state.pubs.filter(p => p.formats?.print).forEach(p => {
    if (state.defaultSizeByPub[p.pubId] === undefined || state.defaultSizeByPub[p.pubId] === null) {
      errors[`size:${p.pubId}`] = "Pick a default ad size";
    }
  });
  state.pubs.filter(p => p.formats?.digital).forEach(p => {
    const lines = state.digitalLines.filter(d => d.pubId === p.pubId);
    if (lines.length === 0) {
      errors[`digital:${p.pubId}`] = "Add at least one digital line";
    }
    lines.forEach(line => {
      if (!line.digitalProductId) errors[`digitalProduct:${line.id}`] = "Pick a product";
      if (!line.flightStartDate)  errors[`flightStart:${line.id}`]    = "Set start date";
      if (!line.flightEndDate)    errors[`flightEnd:${line.id}`]      = "Set end date";
      if (line.flightStartDate && line.flightEndDate && line.flightEndDate < line.flightStartDate) {
        errors[`flightRange:${line.id}`] = "End date must be on or after start date";
      }
    });
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep5(state) {
  const errors = {};
  if (!PAY_TIMINGS.includes(state.payTiming)) {
    errors.payTiming = "Pick a payment timing";
  }
  if (state.payTiming === "monthly" && !CHARGE_DAYS.includes(state.chargeDay)) {
    errors.chargeDay = "Pick a charge day";
  }
  if (state.digitalLines.length > 0) {
    if (!DELIVERY_CADENCES.includes(state.deliveryCadence)) {
      errors.deliveryCadence = "Pick a delivery report cadence";
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep6(state) {
  const errors = {};
  if (!ART_SOURCES.includes(state.artSource)) {
    errors.artSource = "Pick an art source";
  }
  if (state.artSource === "we_design") {
    if (!state.brief?.headline?.trim()) errors.headline = "Headline required for We Design";
    if (!state.brief?.style?.trim())    errors.style    = "Style required for We Design";
    if (!state.brief?.colors?.trim())   errors.colors   = "Colors required for We Design";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

// Step 7 — hard validation. Aggregates all prior steps into a flat list of
// { step, field, msg } entries the Review screen can render with "Fix in
// Step X" deep links.
export function validateStep7(state) {
  const all = [
    { step: 1, ...validateStep1(state) },
    { step: 2, ...validateStep2(state) },
    ...(hasAnyPrintFormat(state) ? [{ step: 3, ...validateStep3(state) }] : []),
    { step: 4, ...validateStep4(state) },
    { step: 5, ...validateStep5(state) },
    { step: 6, ...validateStep6(state) },
  ];
  const errors = all.flatMap(s =>
    Object.entries(s.errors).map(([field, msg]) => ({ step: s.step, field, msg }))
  );
  return { valid: errors.length === 0, errors };
}

// Bulk validator — returns one entry per non-conditional step, used
// for hydrating completedSteps on edit-mode resume.
export function validateAllSteps(state) {
  return {
    1: validateStep1(state),
    2: validateStep2(state),
    3: hasAnyPrintFormat(state) ? validateStep3(state) : { valid: true, errors: {} },
    4: validateStep4(state),
    5: validateStep5(state),
    6: validateStep6(state),
  };
}

export function validateStep(stepId, state) {
  switch (stepId) {
    case 1: return validateStep1(state);
    case 2: return validateStep2(state);
    case 3: return hasAnyPrintFormat(state) ? validateStep3(state) : { valid: true, errors: {} };
    case 4: return validateStep4(state);
    case 5: return validateStep5(state);
    case 6: return validateStep6(state);
    case 7: return validateStep7(state);
    default: return { valid: true, errors: {} };
  }
}
