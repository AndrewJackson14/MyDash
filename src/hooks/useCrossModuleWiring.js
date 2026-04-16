// ============================================================
// useCrossModuleWiring — connects department handoff points
//
// This hook subscribes to events from the event bus and
// triggers actions in other modules. It's the "nervous system"
// from the interaction mesh — the tissue connecting departments.
// ============================================================
import { useEffect } from "react";
import { useEventBus } from "./useEventBus";

// Product types that don't need a design workflow — match the grid's
// EXCLUDED_SIZES in Design Studio so auto-created projects stay aligned.
const DESIGN_EXCLUDED_SIZES = new Set([
  "Calendar Listing", "Church Listing", "Legal Notice", "Classified", "Obituary",
]);

export function useCrossModuleWiring({
  // State setters for cross-module actions
  setNotifications,
  setInvoices,
  invoices,
  clients,
  pubs,
  issues,
  sales,
  upsertAdProject,
}) {
  const bus = useEventBus();

  useEffect(() => {
    const unsubs = [];

    // ─── SALE CLOSED → Notification + Flag for invoicing ──
    unsubs.push(bus.on("sale.closed", ({ saleId, clientId, clientName, amount, publication }) => {
      // Notify production team
      setNotifications(prev => [...(prev || []), {
        id: "n-sale-" + Date.now(),
        text: `Sale closed: ${clientName} — $${(amount || 0).toLocaleString()} for ${publication}. Production: get ad materials.`,
        time: new Date().toLocaleTimeString(),
        read: false,
        route: "billing",
      }]);

      // Auto-create a Design Studio project for the sale so the
      // designer's grid picks it up immediately. Skipped for non-display
      // product types (legal notices, calendar listings, etc.) that
      // don't need a design workflow.
      if (upsertAdProject && saleId) {
        const sale = (sales || []).find(s => s.id === saleId);
        if (sale && !DESIGN_EXCLUDED_SIZES.has(sale.size)) {
          // Camera-ready ads skip the design pipeline — go straight to
          // proof_sent so the rep can send the client's file for approval.
          // Check the client's lastArtSource (set on prior sales/proposals).
          const client = (clients || []).find(c => c.id === sale.clientId);
          const isCameraReady = client?.lastArtSource === "camera_ready";
          upsertAdProject({ saleId, patch: { status: isCameraReady ? "proof_sent" : "brief", art_source: isCameraReady ? "camera_ready" : "we_design" } })
            .catch(err => console.error("auto-create ad_project failed:", err));
        }
      }
    }));

    // ─── PROPOSAL SIGNED → Notification ───────────────────
    unsubs.push(bus.on("proposal.signed", ({ proposalId, clientName, totalAmount, lineCount }) => {
      setNotifications(prev => [...(prev || []), {
        id: "n-prop-" + Date.now(),
        text: `Proposal signed: ${clientName} — $${(totalAmount || 0).toLocaleString()} (${lineCount} items). Generate invoice in Billing.`,
        time: new Date().toLocaleTimeString(),
        read: false,
        route: "billing",
      }]);
    }));

    // ─── INVOICE SENT → Notification ──────────────────────
    unsubs.push(bus.on("invoice.sent", ({ invoiceId, clientId }) => {
      const clientName = clients?.find(c => c.id === clientId)?.name || "Client";
      setNotifications(prev => [...(prev || []), {
        id: "n-inv-" + Date.now(),
        text: `Invoice sent to ${clientName}. Track payment in Billing.`,
        time: new Date().toLocaleTimeString(),
        read: false,
        route: "billing",
      }]);
    }));

    // ─── PAYMENT RECEIVED → Notification ──────────────────
    unsubs.push(bus.on("payment.received", ({ paymentId, invoiceId, clientId, amount }) => {
      const clientName = clients?.find(c => c.id === clientId)?.name || "Client";
      setNotifications(prev => [...(prev || []), {
        id: "n-pay-" + Date.now(),
        text: `Payment received: $${(amount || 0).toLocaleString()} from ${clientName}.`,
        time: new Date().toLocaleTimeString(),
        read: false,
        route: "billing",
      }]);
    }));

    // ─── LEGAL NOTICE PUBLISHED → Notification to bill ────
    unsubs.push(bus.on("legal.published", ({ noticeId, contactName, totalAmount }) => {
      setNotifications(prev => [...(prev || []), {
        id: "n-legal-" + Date.now(),
        text: `Legal notice published for ${contactName} — $${(totalAmount || 0).toLocaleString()}. Ready to bill.`,
        time: new Date().toLocaleTimeString(),
        read: false,
        route: "legalnotices",
      }]);
    }));

    // ─── CREATIVE JOB COMPLETE → Notification to bill ─────
    unsubs.push(bus.on("job.complete", ({ jobId, clientName, title, amount }) => {
      setNotifications(prev => [...(prev || []), {
        id: "n-job-" + Date.now(),
        text: `Creative job complete: "${title}" for ${clientName} — $${(amount || 0).toLocaleString()}. Ready to bill.`,
        time: new Date().toLocaleTimeString(),
        read: false,
        route: "creativejobs",
      }]);
    }));

    // ─── TICKET CREATED → Notification ────────────────────
    unsubs.push(bus.on("ticket.created", ({ ticketId, subject, category, priority }) => {
      const urgency = priority >= 2 ? "URGENT: " : priority >= 1 ? "HIGH: " : "";
      setNotifications(prev => [...(prev || []), {
        id: "n-ticket-" + Date.now(),
        text: `${urgency}New service ticket: ${subject}`,
        time: new Date().toLocaleTimeString(),
        read: false,
        route: "servicedesk",
      }]);
    }));

    // ─── TICKET ESCALATED → Notification to publisher ─────
    unsubs.push(bus.on("ticket.escalated", ({ ticketId, subject, escalatedTo }) => {
      setNotifications(prev => [...(prev || []), {
        id: "n-esc-" + Date.now(),
        text: `Escalated to you: "${subject}" — needs your attention.`,
        time: new Date().toLocaleTimeString(),
        read: false,
        route: "servicedesk",
      }]);
    }));

    // ─── SUBSCRIBER EXPIRING → Notification ───────────────
    unsubs.push(bus.on("subscriber.expiring", ({ subscriberId, name, publicationId, renewalDate }) => {
      const pubName = pubs?.find(p => p.id === publicationId)?.name || "";
      setNotifications(prev => [...(prev || []), {
        id: "n-sub-" + Date.now(),
        text: `Subscription expiring: ${name} (${pubName}) — renewal ${renewalDate}`,
        time: new Date().toLocaleTimeString(),
        read: false,
        route: "circulation",
      }]);
    }));

    // ─── STORY STATUS CHANGE → Notification ───────────────
    unsubs.push(bus.on("story.status", ({ storyId, title, oldStatus, newStatus }) => {
      // Only notify on key transitions
      if (["Approved", "On Page", "Sent to Web"].includes(newStatus)) {
        setNotifications(prev => [...(prev || []), {
          id: "n-story-" + Date.now(),
          text: `"${title}" moved to ${newStatus}`,
          time: new Date().toLocaleTimeString(),
          read: false,
          route: newStatus === "Sent to Web" ? "editorial" : "stories",
        }]);
      }
    }));

    return () => unsubs.forEach(unsub => unsub());
  }, [bus, setNotifications, clients, pubs]);

  return bus;
}

export default useCrossModuleWiring;
