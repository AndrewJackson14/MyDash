// ============================================================
// useProposalWizard — single-source-of-truth reducer + auto-save
//
// Replaces ~20 individual prop* useState calls in SalesCRM.jsx
// with one reducer. Selectors mirror the existing pre-wizard
// derivations (totalInsertions, propLineItems, pTotal, pMonthly,
// monthSpan, autoTier, autoTermLabel) so the persisted proposal
// row shape is identical — insertProposal / updateProposal /
// generateProposalHtml work without changes.
// ============================================================

import { useReducer, useEffect, useMemo, useRef, useCallback } from "react";
import { getAutoTier, getAutoTermLabel } from "../../pages/sales/constants";
import {
  AUTO_SAVE_DEBOUNCE_MS,
  AUTO_SAVE_MAX_RETRIES,
  STEP_IDS,
} from "./proposalWizardConstants";
import {
  validateAllSteps,
  hasAnyPrintFormat,
} from "./proposalWizardValidation";

// ─── Initial state ──────────────────────────────────────────
function makeInitialState({ mode = "new", clientId = "", proposalId = null, proposalName = "" } = {}) {
  return {
    // Navigation
    currentStep: STEP_IDS.CLIENT,
    completedSteps: {},                 // { [stepId]: true }
    mode,                               // 'new' | 'edit' | 'renewal'
    proposalId,

    // Step 1
    clientId,
    proposalName,

    // Step 2
    pubs: [],                           // [{ pubId, formats: { print, digital } }]

    // Step 3
    issuesByPub: {},                    // { [pubId]: [{ issueId, adSizeIdx }] }

    // Step 4
    defaultSizeByPub: {},               // { [pubId]: number }
    perIssueOverrides: {},              // { "pubId:issueId": true }
    digitalLines: [],                   // [{ id, pubId, digitalProductId, flightStartDate, flightEndDate, flightMonths, price, customPrice }]

    // Step 5
    payTiming: "per_issue",
    chargeDay: 1,
    payPlan: false,
    deliveryCadence: "monthly",
    deliveryContactId: null,

    // Step 6
    artSource: "we_design",
    brief: { headline: "", style: "", colors: "", instructions: "" },
    referenceAssets: [],

    // Step 7
    emailRecipients: [],
    emailMessage: "",

    // Auto-save
    saveStatus: "idle",                 // 'idle' | 'saving' | 'saved' | 'error'
    lastSavedAt: null,
    isDirty: false,
    saveRetries: 0,
    lastSaveError: null,
  };
}

// ─── Reducer ────────────────────────────────────────────────
const dirty = (s) => ({ ...s, isDirty: true });

function reducer(state, action) {
  switch (action.type) {
    // Navigation
    case "GOTO_STEP":
      return { ...state, currentStep: action.step };
    case "NEXT_STEP":
      return { ...state, currentStep: Math.min(state.currentStep + 1, STEP_IDS.REVIEW) };
    case "PREV_STEP":
      return { ...state, currentStep: Math.max(state.currentStep - 1, STEP_IDS.CLIENT) };
    case "MARK_COMPLETED":
      return { ...state, completedSteps: { ...state.completedSteps, [action.step]: true } };
    case "SET_COMPLETED_STEPS":
      return { ...state, completedSteps: action.completedSteps };

    // Step 1
    case "SET_CLIENT":
      return dirty({ ...state, clientId: action.clientId });
    case "SET_PROPOSAL_NAME":
      return dirty({ ...state, proposalName: action.name });

    // Step 2
    case "ADD_PUB": {
      if (state.pubs.some(p => p.pubId === action.pubId)) return state;
      return dirty({
        ...state,
        pubs: [...state.pubs, { pubId: action.pubId, formats: { print: true, digital: false } }],
      });
    }
    case "REMOVE_PUB": {
      const nextIssues = { ...state.issuesByPub };       delete nextIssues[action.pubId];
      const nextSizes  = { ...state.defaultSizeByPub };  delete nextSizes[action.pubId];
      return dirty({
        ...state,
        pubs: state.pubs.filter(p => p.pubId !== action.pubId),
        issuesByPub: nextIssues,
        defaultSizeByPub: nextSizes,
        digitalLines: state.digitalLines.filter(d => d.pubId !== action.pubId),
      });
    }
    case "TOGGLE_PUB_FORMAT": {
      return dirty({
        ...state,
        pubs: state.pubs.map(p =>
          p.pubId === action.pubId
            ? { ...p, formats: { ...p.formats, [action.format]: !p.formats[action.format] } }
            : p
        ),
      });
    }

    // Step 3
    case "TOGGLE_ISSUE": {
      const list = state.issuesByPub[action.pubId] || [];
      const has = list.some(i => i.issueId === action.issueId);
      // Default falls back to null when no pub default has been set,
      // so newly-toggled issues land with no size + no price until
      // the rep picks one. selectPropLineItems treats adSizeIdx==null
      // as a zero-price line and the UI renders blank price.
      const defaultIdx = state.defaultSizeByPub[action.pubId] ?? null;
      const nextList = has
        ? list.filter(i => i.issueId !== action.issueId)
        : [...list, { issueId: action.issueId, adSizeIdx: defaultIdx }];
      return dirty({
        ...state,
        issuesByPub: { ...state.issuesByPub, [action.pubId]: nextList },
      });
    }
    case "SET_ISSUES_FOR_PUB": {
      // Default falls back to null when no pub default has been set,
      // so newly-toggled issues land with no size + no price until
      // the rep picks one. selectPropLineItems treats adSizeIdx==null
      // as a zero-price line and the UI renders blank price.
      const defaultIdx = state.defaultSizeByPub[action.pubId] ?? null;
      const nextList = action.issueIds.map(id => {
        const existing = (state.issuesByPub[action.pubId] || []).find(i => i.issueId === id);
        return existing || { issueId: id, adSizeIdx: defaultIdx };
      });
      return dirty({
        ...state,
        issuesByPub: { ...state.issuesByPub, [action.pubId]: nextList },
      });
    }
    case "CLEAR_ISSUES_FOR_PUB": {
      return dirty({
        ...state,
        issuesByPub: { ...state.issuesByPub, [action.pubId]: [] },
      });
    }

    // Step 4
    case "SET_DEFAULT_SIZE": {
      const list = state.issuesByPub[action.pubId] || [];
      const nextList = list.map(i =>
        state.perIssueOverrides[`${action.pubId}:${i.issueId}`]
          ? i
          : { ...i, adSizeIdx: action.adSizeIdx }
      );
      return dirty({
        ...state,
        defaultSizeByPub: { ...state.defaultSizeByPub, [action.pubId]: action.adSizeIdx },
        issuesByPub: { ...state.issuesByPub, [action.pubId]: nextList },
      });
    }
    case "SET_ISSUE_SIZE": {
      const list = state.issuesByPub[action.pubId] || [];
      const nextList = list.map(i =>
        i.issueId === action.issueId ? { ...i, adSizeIdx: action.adSizeIdx } : i
      );
      const key = `${action.pubId}:${action.issueId}`;
      return dirty({
        ...state,
        issuesByPub: { ...state.issuesByPub, [action.pubId]: nextList },
        perIssueOverrides: { ...state.perIssueOverrides, [key]: true },
      });
    }
    case "APPLY_SIZE_BELOW": {
      const list = state.issuesByPub[action.pubId] || [];
      const fromIdx = list.findIndex(i => i.issueId === action.fromIssueId);
      if (fromIdx < 0) return state;
      const nextList = list.map((i, idx) =>
        idx >= fromIdx ? { ...i, adSizeIdx: action.adSizeIdx } : i
      );
      const overrideAdds = {};
      list.slice(fromIdx).forEach(i => {
        overrideAdds[`${action.pubId}:${i.issueId}`] = true;
      });
      return dirty({
        ...state,
        issuesByPub: { ...state.issuesByPub, [action.pubId]: nextList },
        perIssueOverrides: { ...state.perIssueOverrides, ...overrideAdds },
      });
    }
    case "ADD_DIGITAL_LINE": {
      return dirty({
        ...state,
        digitalLines: [
          ...state.digitalLines,
          {
            id: `dl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            pubId: action.pubId || "",
            digitalProductId: "",
            flightStartDate: action.today || "",
            flightEndDate: "",
            flightMonths: 1,
            price: 0,
            customPrice: false,
          },
        ],
      });
    }
    case "UPDATE_DIGITAL_LINE":
      return dirty({
        ...state,
        digitalLines: state.digitalLines.map(d =>
          d.id === action.id ? { ...d, ...action.patch } : d
        ),
      });
    case "REMOVE_DIGITAL_LINE":
      return dirty({
        ...state,
        digitalLines: state.digitalLines.filter(d => d.id !== action.id),
      });

    // Step 5
    case "SET_PAY_TIMING":
      return dirty({ ...state, payTiming: action.timing, payPlan: action.timing === "monthly" });
    case "SET_CHARGE_DAY":
      return dirty({ ...state, chargeDay: action.day });
    case "SET_DELIVERY_CADENCE":
      return dirty({ ...state, deliveryCadence: action.cadence });
    case "SET_DELIVERY_CONTACT":
      return dirty({ ...state, deliveryContactId: action.contactId });

    // Step 6
    case "SET_ART_SOURCE":
      return dirty({ ...state, artSource: action.source });
    case "SET_BRIEF_FIELD":
      return dirty({ ...state, brief: { ...state.brief, [action.field]: action.value } });
    case "ADD_REFERENCE_ASSET":
      return dirty({ ...state, referenceAssets: [...state.referenceAssets, action.asset] });
    case "UPDATE_REFERENCE_ASSET":
      return dirty({
        ...state,
        referenceAssets: state.referenceAssets.map(a =>
          a.id === action.id ? { ...a, ...action.patch } : a
        ),
      });
    case "REMOVE_REFERENCE_ASSET":
      return dirty({
        ...state,
        referenceAssets: state.referenceAssets.filter(a => a.id !== action.id),
      });

    // Step 7 (send composition)
    case "SET_EMAIL_RECIPIENTS":
      return { ...state, emailRecipients: action.recipients };
    case "TOGGLE_RECIPIENT": {
      const has = state.emailRecipients.includes(action.email);
      return {
        ...state,
        emailRecipients: has
          ? state.emailRecipients.filter(e => e !== action.email)
          : [...state.emailRecipients, action.email],
      };
    }
    case "SET_EMAIL_MESSAGE":
      return { ...state, emailMessage: action.message };

    // Save
    case "SAVE_START":
      return { ...state, saveStatus: "saving" };
    case "SAVE_SUCCESS":
      return {
        ...state,
        saveStatus: "saved",
        proposalId: action.proposalId || state.proposalId,
        lastSavedAt: action.savedAt,
        isDirty: false,
        saveRetries: 0,
        lastSaveError: null,
      };
    case "SAVE_ERROR":
      return {
        ...state,
        saveStatus: "error",
        saveRetries: (state.saveRetries || 0) + 1,
        lastSaveError: action.error,
      };

    // Hydrate
    case "HYDRATE":
      return { ...action.state, isDirty: false };

    default:
      return state;
  }
}

// ─── Selectors ──────────────────────────────────────────────
// Mirror SalesCRM.jsx pre-wizard derivations exactly so the
// persisted proposal row matches what the rest of the app expects.

export function selectAllSelectedIssues(state) {
  return state.pubs
    .filter(p => p.formats?.print)
    .flatMap(p => (state.issuesByPub[p.pubId] || []).map(i => ({ pubId: p.pubId, ...i })));
}

export function selectTotalInsertions(state) {
  return selectAllSelectedIssues(state).length;
}

export function selectAutoTier(state) {
  return getAutoTier(selectTotalInsertions(state));
}

export function selectAutoTermLabel(state) {
  return getAutoTermLabel(selectTotalInsertions(state));
}

export function selectAllIssueDates(state, issueMap) {
  return selectAllSelectedIssues(state)
    .map(i => issueMap[i.issueId]?.date)
    .filter(Boolean)
    .sort();
}

export function selectMonthSpan(state, issueMap) {
  const dates = selectAllIssueDates(state, issueMap);
  if (dates.length < 2) return 1;
  const first = new Date(dates[0]);
  const last  = new Date(dates[dates.length - 1]);
  return Math.max(1, Math.ceil((last - first) / (30.44 * 86400000)) + 1);
}

export function selectDigitalLineItems(state, ctx) {
  const { digitalAdProducts, pubs } = ctx;
  return state.digitalLines
    .filter(d => d.digitalProductId && d.flightStartDate && d.flightEndDate)
    .map(d => {
      const product = (digitalAdProducts || []).find(p => p.id === d.digitalProductId);
      const pub = pubs.find(p => p.id === d.pubId);
      return {
        pubId: d.pubId,
        pubName: pub?.name,
        adSize: product?.name || "Digital",
        dims: product ? `${product.width || ""}x${product.height || ""}`.replace(/^x$/, "") : "",
        adW: product?.width || 0,
        adH: product?.height || 0,
        issueId: null,
        issueLabel: null,
        issueDate: null,
        digitalProductId: d.digitalProductId,
        flightStartDate: d.flightStartDate,
        flightEndDate: d.flightEndDate,
        flightMonths: d.flightMonths,
        price: Number(d.price) || 0,
      };
    });
}

export function selectPropLineItems(state, ctx) {
  const { pubs, issueMap, issLabel } = ctx;
  const tier = selectAutoTier(state);
  const printLines = state.pubs
    .filter(p => p.formats?.print)
    .flatMap(p => {
      const pub = pubs.find(x => x.id === p.pubId);
      return (state.issuesByPub[p.pubId] || []).map(iss => {
        // adSizeIdx may be null when the rep hasn't picked a size yet;
        // ad/dims/price collapse to falsy → preview shows the issue but
        // contributes 0 to totals. Forces the rep back to fill it in.
        const ad = (iss.adSizeIdx == null) ? null : pub?.adSizes?.[iss.adSizeIdx];
        const issue = issueMap[iss.issueId];
        return {
          pubId: p.pubId,
          pubName: pub?.name,
          adSize: ad?.name || null,
          dims: ad?.dims || null,
          adW: ad?.w || null,
          adH: ad?.h || null,
          issueId: iss.issueId,
          issueLabel: issLabel ? issLabel(iss.issueId) : (issue?.label || ""),
          issueDate: issue?.date || null,
          adDeadline: issue?.adDeadline || null,
          price: ad ? (ad?.[tier] || ad?.rate || 0) : 0,
          adSizeIdx: iss.adSizeIdx,
        };
      });
    });
  return [...printLines, ...selectDigitalLineItems(state, ctx)];
}

export function selectPTotal(state, ctx) {
  return selectPropLineItems(state, ctx).reduce((s, li) => s + (Number(li.price) || 0), 0);
}

export function selectPMonthly(state, ctx) {
  const total = selectPTotal(state, ctx);
  const span  = selectMonthSpan(state, ctx.issueMap);
  return span > 1 ? Math.ceil(total / span) : total;
}

export function selectPubSummary(state, ctx, pubId) {
  const tier = selectAutoTier(state);
  const pub  = ctx.pubs.find(p => p.id === pubId);
  const issues = state.issuesByPub[pubId] || [];
  const total  = issues.reduce((s, iss) => {
    const ad = pub?.adSizes?.[iss.adSizeIdx];
    return s + (ad?.[tier] || ad?.rate || 0);
  }, 0);
  return `${issues.length} issues · $${total.toLocaleString()}`;
}

// ─── Serialization ──────────────────────────────────────────
// Build the row shape that insertProposal / updateProposal expect.
// Matches the existing SalesCRM "Save Draft" payload exactly,
// with delivery_report_* fields added (the pre-wizard modal had a
// latent bug where these were edited but not saved on Save Draft).
export function serializeStateToProposalRow(state, ctx, status, today) {
  const lineItems = selectPropLineItems(state, ctx);
  return {
    clientId: state.clientId,
    name: state.proposalName,
    term: selectAutoTermLabel(state),
    termMonths: selectMonthSpan(state, ctx.issueMap),
    lines: lineItems.map(li => ({
      ...li,
      issueDate: li.issueDate || ctx.issueMap[li.issueId]?.date || null,
      adDeadline: li.adDeadline || ctx.issueMap[li.issueId]?.adDeadline || null,
    })),
    total: selectPTotal(state, ctx),
    payPlan: state.payTiming === "monthly",
    payTiming: state.payTiming,
    artSource: state.artSource,
    briefHeadline: state.brief.headline || null,
    briefStyle: state.brief.style || null,
    briefColors: state.brief.colors || null,
    briefInstructions: state.brief.instructions || null,
    monthly: selectPMonthly(state, ctx),
    chargeDay: state.chargeDay,
    deliveryReportCadence: state.digitalLines.length > 0 ? state.deliveryCadence : null,
    deliveryReportContactId: state.deliveryContactId || null,
    status,
    date: today,
    renewalDate: null,
    sentTo: state.emailRecipients,
  };
}

// ─── Hydration ──────────────────────────────────────────────
// Edit mode: re-hydrate state from a stored proposal row. Inverse
// of serializeStateToProposalRow. Reconstructs pubs / formats /
// issuesByPub / defaultSizeByPub from the flat lines array.
export function hydrateStateFromProposal(proposal, ctx) {
  const { pubs } = ctx;
  const grouped = {};        // { pubId: [{ issueId, adSizeIdx }] }
  const formats = {};        // { pubId: { print, digital } }
  const sizeFreq = {};       // { pubId: { idx: count } }
  const digitalLines = [];

  (proposal.lines || []).forEach(li => {
    const pubId = li.pubId;
    if (!pubId) return;

    if (li.digitalProductId || li.digital_product_id) {
      formats[pubId] = { print: formats[pubId]?.print || false, digital: true };
      digitalLines.push({
        id: `dl_${pubId}_${digitalLines.length}_${Math.random().toString(36).slice(2, 6)}`,
        pubId,
        digitalProductId: li.digitalProductId || li.digital_product_id,
        flightStartDate: li.flightStartDate || li.flight_start_date || "",
        flightEndDate: li.flightEndDate || li.flight_end_date || "",
        flightMonths: li.flightMonths || li.flight_months || 1,
        price: Number(li.price) || 0,
        customPrice: false,
      });
      return;
    }

    formats[pubId] = { print: true, digital: formats[pubId]?.digital || false };
    const pub = pubs.find(p => p.id === pubId);
    const ai = (pub?.adSizes || []).findIndex(a => a.name === li.adSize);
    const idx = ai >= 0 ? ai : 0;
    if (!grouped[pubId]) grouped[pubId] = [];
    grouped[pubId].push({ issueId: li.issueId, adSizeIdx: idx });
    sizeFreq[pubId] = sizeFreq[pubId] || {};
    sizeFreq[pubId][idx] = (sizeFreq[pubId][idx] || 0) + 1;
  });

  // Default size = most-frequent ad size for the pub. Ties resolved
  // by lowest index so the result is deterministic.
  const defaultSizeByPub = {};
  Object.entries(sizeFreq).forEach(([pubId, freq]) => {
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1] || (+a[0]) - (+b[0]));
    defaultSizeByPub[pubId] = +sorted[0][0];
  });

  // perIssueOverrides = issues whose adSizeIdx differs from the default
  const perIssueOverrides = {};
  Object.entries(grouped).forEach(([pubId, list]) => {
    list.forEach(i => {
      if (i.adSizeIdx !== defaultSizeByPub[pubId]) {
        perIssueOverrides[`${pubId}:${i.issueId}`] = true;
      }
    });
  });

  return {
    ...makeInitialState({
      mode: "edit",
      clientId: proposal.clientId,
      proposalId: proposal.id,
      proposalName: proposal.name || "",
    }),
    pubs: Object.keys(formats).map(pubId => ({ pubId, formats: formats[pubId] })),
    issuesByPub: grouped,
    defaultSizeByPub,
    perIssueOverrides,
    digitalLines,
    payTiming: proposal.payTiming || (proposal.payPlan ? "monthly" : "per_issue"),
    chargeDay: proposal.chargeDay || 1,
    payPlan: !!proposal.payPlan,
    deliveryCadence: proposal.deliveryReportCadence || proposal.delivery_report_cadence || "monthly",
    deliveryContactId: proposal.deliveryReportContactId || proposal.delivery_report_contact_id || null,
    artSource: proposal.artSource || "we_design",
    brief: {
      headline: proposal.briefHeadline || proposal.brief_headline || "",
      style: proposal.briefStyle || proposal.brief_style || "",
      colors: proposal.briefColors || proposal.brief_colors || "",
      instructions: proposal.briefInstructions || proposal.brief_instructions || "",
    },
  };
}

// ─── Hook ───────────────────────────────────────────────────
export function useProposalWizard({
  initialMode = "new",
  initialClientId = "",
  initialProposalName = "",
  initialProposalId = null,
  hydratedState = null,
  ctx,                            // { pubs, issues, issueMap, issLabel, digitalAdProducts }
  insertProposal,
  updateProposal,
  enableAutoSave = true,
  today,
} = {}) {
  const [state, dispatch] = useReducer(
    reducer,
    null,
    () =>
      hydratedState ||
      makeInitialState({
        mode: initialMode,
        clientId: initialClientId,
        proposalId: initialProposalId,
        proposalName: initialProposalName,
      })
  );

  // On first render with hydrated state, run validation to determine
  // which steps were already completed and where to land the rep.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    if (!hydratedState) return;
    const results = validateAllSteps(state);
    const completed = {};
    let firstInvalidStep = null;
    [1, 2, 3, 4, 5, 6].forEach(stepId => {
      if (stepId === 3 && !hasAnyPrintFormat(state)) return;
      if (results[stepId].valid) {
        completed[stepId] = true;
      } else if (firstInvalidStep === null) {
        firstInvalidStep = stepId;
      }
    });
    dispatch({ type: "SET_COMPLETED_STEPS", completedSteps: completed });
    dispatch({ type: "GOTO_STEP", step: firstInvalidStep || STEP_IDS.REVIEW });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-save ────────────────────────────────────────────
  // Don't open a draft until we have at least clientId + name; otherwise
  // every wizard launch would write a row even if the rep bailed in 2s.
  // Skip while sending the final proposal (status flips to 'Sent' there).
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const insertRef = useRef(insertProposal);
  insertRef.current = insertProposal;
  const updateRef = useRef(updateProposal);
  updateRef.current = updateProposal;

  useEffect(() => {
    if (!enableAutoSave) return;
    if (!state.isDirty) return;
    if (!state.clientId || !state.proposalName?.trim()) return;
    if (state.saveRetries >= AUTO_SAVE_MAX_RETRIES) return;

    const timer = setTimeout(async () => {
      dispatch({ type: "SAVE_START" });
      try {
        const row = serializeStateToProposalRow(state, ctxRef.current, "Draft", today);
        const result = state.proposalId
          ? await updateRef.current(state.proposalId, row)
          : await insertRef.current(row);
        const newId = state.proposalId || result?.id || null;
        dispatch({
          type: "SAVE_SUCCESS",
          proposalId: newId,
          savedAt: new Date().toISOString(),
        });
      } catch (err) {
        dispatch({ type: "SAVE_ERROR", error: err?.message || String(err) });
      }
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [state, enableAutoSave, today]);

  // ─── Bound dispatchers — terse callsites in step components ─
  const actions = useMemo(() => ({
    gotoStep: step => dispatch({ type: "GOTO_STEP", step }),
    next: () => dispatch({ type: "NEXT_STEP" }),
    prev: () => dispatch({ type: "PREV_STEP" }),
    markCompleted: step => dispatch({ type: "MARK_COMPLETED", step }),

    setClient: clientId => dispatch({ type: "SET_CLIENT", clientId }),
    setProposalName: name => dispatch({ type: "SET_PROPOSAL_NAME", name }),

    addPub: pubId => dispatch({ type: "ADD_PUB", pubId }),
    removePub: pubId => dispatch({ type: "REMOVE_PUB", pubId }),
    togglePubFormat: (pubId, format) => dispatch({ type: "TOGGLE_PUB_FORMAT", pubId, format }),

    toggleIssue: (pubId, issueId) => dispatch({ type: "TOGGLE_ISSUE", pubId, issueId }),
    setIssuesForPub: (pubId, issueIds) => dispatch({ type: "SET_ISSUES_FOR_PUB", pubId, issueIds }),
    clearIssuesForPub: pubId => dispatch({ type: "CLEAR_ISSUES_FOR_PUB", pubId }),

    setDefaultSize: (pubId, adSizeIdx) => dispatch({ type: "SET_DEFAULT_SIZE", pubId, adSizeIdx }),
    setIssueSize: (pubId, issueId, adSizeIdx) => dispatch({ type: "SET_ISSUE_SIZE", pubId, issueId, adSizeIdx }),
    applySizeBelow: (pubId, fromIssueId, adSizeIdx) => dispatch({ type: "APPLY_SIZE_BELOW", pubId, fromIssueId, adSizeIdx }),
    addDigitalLine: (pubId, todayStr) => dispatch({ type: "ADD_DIGITAL_LINE", pubId, today: todayStr }),
    updateDigitalLine: (id, patch) => dispatch({ type: "UPDATE_DIGITAL_LINE", id, patch }),
    removeDigitalLine: id => dispatch({ type: "REMOVE_DIGITAL_LINE", id }),

    setPayTiming: timing => dispatch({ type: "SET_PAY_TIMING", timing }),
    setChargeDay: day => dispatch({ type: "SET_CHARGE_DAY", day }),
    setDeliveryCadence: cadence => dispatch({ type: "SET_DELIVERY_CADENCE", cadence }),
    setDeliveryContact: contactId => dispatch({ type: "SET_DELIVERY_CONTACT", contactId }),

    setArtSource: source => dispatch({ type: "SET_ART_SOURCE", source }),
    setBriefField: (field, value) => dispatch({ type: "SET_BRIEF_FIELD", field, value }),
    addReferenceAsset: asset => dispatch({ type: "ADD_REFERENCE_ASSET", asset }),
    updateReferenceAsset: (id, patch) => dispatch({ type: "UPDATE_REFERENCE_ASSET", id, patch }),
    removeReferenceAsset: id => dispatch({ type: "REMOVE_REFERENCE_ASSET", id }),

    setEmailRecipients: recipients => dispatch({ type: "SET_EMAIL_RECIPIENTS", recipients }),
    toggleRecipient: email => dispatch({ type: "TOGGLE_RECIPIENT", email }),
    setEmailMessage: message => dispatch({ type: "SET_EMAIL_MESSAGE", message }),

    saveStart: () => dispatch({ type: "SAVE_START" }),
    saveSuccess: (proposalId, savedAt) => dispatch({ type: "SAVE_SUCCESS", proposalId, savedAt }),
    saveError: error => dispatch({ type: "SAVE_ERROR", error }),
    hydrate: newState => dispatch({ type: "HYDRATE", state: newState }),
  }), []);

  // Manual save — for "Save Draft" button on Step 7 (independent of debounce).
  const saveNow = useCallback(async (status = "Draft") => {
    dispatch({ type: "SAVE_START" });
    try {
      const row = serializeStateToProposalRow(state, ctxRef.current, status, today);
      const result = state.proposalId
        ? await updateRef.current(state.proposalId, row)
        : await insertRef.current(row);
      const newId = state.proposalId || result?.id || null;
      dispatch({
        type: "SAVE_SUCCESS",
        proposalId: newId,
        savedAt: new Date().toISOString(),
      });
      return { success: true, proposalId: newId };
    } catch (err) {
      dispatch({ type: "SAVE_ERROR", error: err?.message || String(err) });
      return { success: false, error: err };
    }
  }, [state, today]);

  return { state, dispatch, actions, saveNow };
}

export { makeInitialState };
