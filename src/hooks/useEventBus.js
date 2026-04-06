// ============================================================
// useEventBus — lightweight pub/sub for cross-module wiring
//
// Modules publish events:  bus.emit("sale.closed", { saleId, clientId, amount })
// Other modules subscribe: bus.on("sale.closed", handler)
//
// Events are fire-and-forget. Handlers run synchronously in
// the order they were registered. The bus resets on unmount.
// ============================================================
import { useRef, useCallback, useEffect } from "react";

const globalListeners = {};

export function useEventBus() {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const on = useCallback((event, handler) => {
    if (!globalListeners[event]) globalListeners[event] = [];
    globalListeners[event].push(handler);
    // Return unsubscribe function
    return () => {
      globalListeners[event] = (globalListeners[event] || []).filter(h => h !== handler);
    };
  }, []);

  const emit = useCallback((event, payload) => {
    (globalListeners[event] || []).forEach(handler => {
      try { handler(payload); } catch (e) { console.error(`[EventBus] Error in ${event} handler:`, e); }
    });
  }, []);

  return { on, emit };
}

// ─── Event Types (documentation) ────────────────────────────
// sale.closed        { saleId, clientId, clientName, amount, publication }
// proposal.signed    { proposalId, clientId, clientName, totalAmount, lineCount }
// invoice.created    { invoiceId, clientId, total }
// invoice.sent       { invoiceId, clientId }
// payment.received   { paymentId, invoiceId, clientId, amount }
// legal.published    { noticeId, contactName, totalAmount }
// legal.billed       { noticeId, invoiceId }
// job.complete       { jobId, clientId, clientName, title, amount }
// job.billed         { jobId, invoiceId }
// ticket.created     { ticketId, subject, category, priority }
// ticket.escalated   { ticketId, subject, escalatedTo }
// subscriber.expiring { subscriberId, name, publicationId, renewalDate }
// story.status       { storyId, title, oldStatus, newStatus }

export default useEventBus;
