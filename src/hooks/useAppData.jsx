import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { supabase, isOnline } from '../lib/supabase';

const DataContext = createContext(null);

// ============================================================
// DataProvider: Single source of truth for all app data
// Online → reads from Supabase, writes sync to DB
// Offline → uses local generators (original behavior)
// ============================================================
export function DataProvider({ children, localData }) {
  // ─── Original tables ────────────────────────────────────
  const [pubs, setPubs] = useState(localData.pubs);
  const [issues, setIssues] = useState(localData.issues);
  const [stories, setStories] = useState(localData.stories);
  const [clients, setClients] = useState(localData.clients);
  const [sales, setSales] = useState(localData.sales);
  const [proposals, setProposals] = useState(localData.proposals);
  const [team, setTeam] = useState(localData.team);
  const [notifications, setNotifications] = useState(localData.notifications);

  // ─── Phase 2 tables ─────────────────────────────────────
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [dropLocations, setDropLocations] = useState([]);
  const [dropLocationPubs, setDropLocationPubs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driverRoutes, setDriverRoutes] = useState([]);
  const [routeStops, setRouteStops] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketComments, setTicketComments] = useState([]);
  const [legalNotices, setLegalNotices] = useState([]);
  const [legalNoticeIssues, setLegalNoticeIssues] = useState([]);
  const [creativeJobs, setCreativeJobs] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [contractLines, setContractLines] = useState([]);
  const [salesSummary, setSalesSummary] = useState([]);
  // Commission tables
  const [commissionLedger, setCommissionLedger] = useState([]);
  const [commissionPayouts, setCommissionPayouts] = useState([]);
  const [commissionGoals, setCommissionGoals] = useState([]);
  const [commissionRates, setCommissionRates] = useState([]);
  const [salespersonPubAssignments, setSalespersonPubAssignments] = useState([]);
  // Outreach campaigns
  const [outreachCampaigns, setOutreachCampaigns] = useState([]);
  const [outreachEntries, setOutreachEntries] = useState([]);
  const [myPriorities, setMyPriorities] = useState([]);
  // Subscription management tables
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionPayments, setSubscriptionPayments] = useState([]);
  const [mailingLists, setMailingLists] = useState([]);
  // Editions (issuu_editions)
  const [editions, setEditions] = useState([]);
  // Ad inquiries (inbound from StellarPress)
  const [adInquiries, setAdInquiries] = useState([]);

  const [loaded, setLoaded] = useState(!isOnline());

  // Failsafe timeout
  useEffect(() => {
    if (!isOnline()) return;
    const timer = setTimeout(() => { if (!loaded) { console.warn('Supabase timeout — loading local'); setLoaded(true); } }, 5000);
    return () => clearTimeout(timer);
  }, [loaded]);

  // Helper to fetch all rows from a table (bypasses 1000-row PostgREST limit)
  const fetchAllRows = useCallback(async (table, orderCol, ascending = true) => {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      let q = supabase.from(table).select('*').range(from, from + pageSize - 1);
      if (orderCol) q = q.order(orderCol, { ascending });
      const { data, error } = await q;
      if (error) { console.error(`Fetch ${table} error:`, error); break; }
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  }, []);

  // ─── Fetch all data ─────────────────────────────────────
  useEffect(() => {
    if (!isOnline()) return;

    const fetchAll = async () => {
      try {
        // === BOOT: All queries in parallel, clients paginated in parallel ===
        const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        const clientSelect = 'id,name,status,total_spend,category,address,city,state,zip,rep_id,contract_end_date,last_ad_date';
        const [pubsRes, teamRes, notifsRes, adSizesRes, c0, c1, c2, c3, issuesRes, s0, s1, s2, s3] = await Promise.all([
          supabase.from('publications').select('*').order('name'),
          supabase.from('team_members').select('*').order('name'),
          supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
          supabase.from('ad_sizes').select('*').order('sort_order'),
          // Clients: 4 parallel pages of 1000
          supabase.from('clients').select(clientSelect).order('name').range(0, 999),
          supabase.from('clients').select(clientSelect).order('name').range(1000, 1999),
          supabase.from('clients').select(clientSelect).order('name').range(2000, 2999),
          supabase.from('clients').select(clientSelect).order('name').range(3000, 3999),
          // Issues: single page (1,439 rows fits in 2 pages)
          supabase.from('issues').select('*').order('date').range(0, 999),
          // Sales: 4 parallel pages of 1000 (3-month window)
          supabase.from('sales').select('*').gte('date', cutoff).order('date', { ascending: false }).range(0, 999),
          supabase.from('sales').select('*').gte('date', cutoff).order('date', { ascending: false }).range(1000, 1999),
          supabase.from('sales').select('*').gte('date', cutoff).order('date', { ascending: false }).range(2000, 2999),
          supabase.from('sales').select('*').gte('date', cutoff).order('date', { ascending: false }).range(3000, 3999),
        ]);

        // Also fetch issues page 2 if needed
        const allIssuesRaw = issuesRes.data || [];
        if (allIssuesRaw.length === 1000) {
          const i1 = await supabase.from('issues').select('*').order('date').range(1000, 1999);
          if (i1.data) allIssuesRaw.push(...i1.data);
        }

        // Merge parallel pages
        const allClientsRaw = [...(c0.data || []), ...(c1.data || []), ...(c2.data || []), ...(c3.data || [])];
        const allSalesRaw = [...(s0.data || []), ...(s1.data || []), ...(s2.data || []), ...(s3.data || [])];

        console.log('Boot:', { pubs: pubsRes.data?.length, clients: allClientsRaw.length, issues: allIssuesRaw.length, sales: allSalesRaw.length });

        console.time('boot-transform');

        if (pubsRes.data && adSizesRes.data) {
          setPubs(pubsRes.data.map(p => ({
            id: p.id, name: p.name, color: p.color, type: p.type,
            pageCount: p.page_count, width: Number(p.width), height: Number(p.height),
            frequency: p.frequency, circ: p.circulation,
            defaultRevenueGoal: Number(p.default_revenue_goal || 0),
            adSizes: adSizesRes.data.filter(a => a.pub_id === p.id).map(a => ({
              name: a.name, dims: a.dims, w: Number(a.width), h: Number(a.height),
              rate: a.rate, rate6: a.rate_6, rate12: a.rate_12, rate18: a.rate_18,
            })),
          })));
        }

        if (teamRes.data) setTeam(teamRes.data.map(t => ({ id: t.id, name: t.name, role: t.role, email: t.email, phone: t.phone || '', alerts: t.alerts || [], pubs: t.assigned_pubs || ['all'], permissions: t.permissions || [], modulePermissions: t.module_permissions || [], isHidden: t.is_hidden || false, isFreelance: t.is_freelance, rateType: t.rate_type, rateAmount: Number(t.rate_amount || 0), specialties: t.specialties || [], commissionTrigger: t.commission_trigger || 'both', commissionDefaultRate: Number(t.commission_default_rate || 20) })));
        if (notifsRes.data) setNotifications(notifsRes.data.map(n => ({ id: n.id, text: n.text, time: new Date(n.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), read: n.read, route: n.route })));

        if (allClientsRaw.length > 0) setClients(allClientsRaw.map(c => ({
          id: c.id, name: c.name, status: c.status, totalSpend: Number(c.total_spend),
          category: c.category || '', address: c.address || '', city: c.city || '', state: c.state || '', zip: c.zip || '',
          repId: c.rep_id || null, contractEndDate: c.contract_end_date || null, lastAdDate: c.last_ad_date || null,
          contacts: [], comms: [], yearlySummary: [],
        })));

        if (allIssuesRaw.length > 0) setIssues(allIssuesRaw.map(i => ({ id: i.id, pubId: i.pub_id, label: i.label, date: i.date, pageCount: i.page_count, adDeadline: i.ad_deadline, edDeadline: i.ed_deadline, status: i.status, revenueGoal: i.revenue_goal != null ? Number(i.revenue_goal) : null })));

        if (allSalesRaw.length > 0) setSales(allSalesRaw.map(s => ({
          id: s.id, clientId: s.client_id, publication: s.publication_id, issueId: s.issue_id,
          type: s.ad_type, size: s.ad_size, adW: Number(s.ad_width), adH: Number(s.ad_height),
          amount: Number(s.amount), status: s.status, date: s.date, closedAt: s.closed_at,
          page: s.page, pagePos: s.grid_row != null ? { row: s.grid_row, col: s.grid_col } : null,
          nextAction: s.next_action_type ? { type: s.next_action_type, label: s.next_action_label } : null,
          nextActionDate: s.next_action_date || '', proposalId: s.proposal_id, oppNotes: s.notes || [],
          productType: s.product_type || 'display_print', placementNotes: s.placement_notes || '',
          contractId: s.contract_id || null,
        })));

        console.timeEnd('boot-transform');
        console.log('>>> CALLING setLoaded(true) NOW');
        setLoaded(true);
        console.log('>>> setLoaded(true) CALLED');
      } catch (err) {
        console.error('Supabase fetch error', err);
        console.log('>>> CALLING setLoaded(true) from CATCH');
        setLoaded(true);
      }
    };
    fetchAll();
  }, []);

  // ============================================================
  // LAZY LOADERS — fetch module-specific data on first access
  // ============================================================

  // Full sales (12 months) — loaded when Sales/Flatplan opens
  const [fullSalesLoaded, setFullSalesLoaded] = useState(false);
  const loadFullSales = useCallback(async () => {
    if (fullSalesLoaded || !isOnline()) return;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 12);
    const cutoff = cutoffDate.toISOString().slice(0, 10);
    let allSales = [];
    let sp = 0;
    while (true) {
      const { data } = await supabase.from('sales').select('*').gte('date', cutoff).order('date', { ascending: false }).range(sp * 1000, (sp + 1) * 1000 - 1);
      if (!data || data.length === 0) break;
      allSales = allSales.concat(data);
      if (data.length < 1000) break;
      sp++;
    }
    if (allSales.length > 0) setSales(allSales.map(s => ({
      id: s.id, clientId: s.client_id, publication: s.publication_id, issueId: s.issue_id,
      type: s.ad_type, size: s.ad_size, adW: Number(s.ad_width), adH: Number(s.ad_height),
      amount: Number(s.amount), status: s.status, date: s.date, closedAt: s.closed_at,
      page: s.page, pagePos: s.grid_row != null ? { row: s.grid_row, col: s.grid_col } : null,
      nextAction: s.next_action_type ? { type: s.next_action_type, label: s.next_action_label } : null,
      nextActionDate: s.next_action_date || '', proposalId: s.proposal_id, oppNotes: s.notes || [],
      productType: s.product_type || 'display_print', placementNotes: s.placement_notes || '',
      contractId: s.contract_id || null,
    })));
    setFullSalesLoaded(true);
  }, [fullSalesLoaded]);

  // Client details (contacts, comms, sales summary) — loaded when opening a client profile
  const [clientDetailsLoaded, setClientDetailsLoaded] = useState(false);
  const loadClientDetails = useCallback(async () => {
    if (clientDetailsLoaded || !isOnline()) return;
    const [allContacts, allComms, allSalesSummary] = await Promise.all([
      fetchAllRows('client_contacts', null),
      fetchAllRows('communications', 'created_at', false),
      fetchAllRows('client_sales_summary', null),
    ]);
    const contactsByClient = {};
    allContacts.forEach(ct => {
      if (!contactsByClient[ct.client_id]) contactsByClient[ct.client_id] = [];
      contactsByClient[ct.client_id].push({ id: ct.id, name: ct.name, email: ct.email, phone: ct.phone, role: ct.role, isPrimary: ct.is_primary });
    });
    const commsByClient = {};
    allComms.forEach(cm => {
      if (!commsByClient[cm.client_id]) commsByClient[cm.client_id] = [];
      commsByClient[cm.client_id].push({ id: cm.id, type: cm.type, author: cm.author_name, date: cm.date, note: cm.note });
    });
    const summaryByClient = {};
    allSalesSummary.forEach(s => {
      if (!summaryByClient[s.client_id]) summaryByClient[s.client_id] = [];
      summaryByClient[s.client_id].push({
        pubId: s.publication_id, year: s.year, orderCount: s.order_count,
        revenue: Number(s.total_revenue), avgOrder: Number(s.avg_order),
        adSizes: s.ad_sizes || [], firstDate: s.first_order_date, lastDate: s.last_order_date,
      });
    });
    setClients(cl => cl.map(c => ({
      ...c,
      contacts: contactsByClient[c.id] || c.contacts,
      comms: commsByClient[c.id] || c.comms,
      yearlySummary: summaryByClient[c.id] || c.yearlySummary,
    })));
    setSalesSummary(allSalesSummary.map(s => ({
      clientId: s.client_id, pubId: s.publication_id, year: s.year,
      orderCount: s.order_count, revenue: Number(s.total_revenue),
      avgOrder: Number(s.avg_order), adSizes: s.ad_sizes || [],
      firstDate: s.first_order_date, lastDate: s.last_order_date,
    })));
    setClientDetailsLoaded(true);
  }, [clientDetailsLoaded]);

  // Proposals — loaded when Sales module needs them
  const [proposalsLoaded, setProposalsLoaded] = useState(false);
  const loadProposals = useCallback(async () => {
    if (proposalsLoaded || !isOnline()) return;
    const [proposalsRes, propLinesRes] = await Promise.all([
      supabase.from('proposals').select('*').order('date', { ascending: false }),
      supabase.from('proposal_lines').select('*'),
    ]);
    if (proposalsRes.data && propLinesRes.data) {
      setProposals(proposalsRes.data.map(p => ({
        id: p.id, clientId: p.client_id, name: p.name, term: p.term, termMonths: p.term_months,
        total: Number(p.total), payPlan: p.pay_plan, monthly: Number(p.monthly),
        status: p.status, date: p.date, renewalDate: p.renewal_date, closedAt: p.closed_at, sentTo: p.sent_to || [],
        lines: propLinesRes.data.filter(l => l.proposal_id === p.id).map(l => ({
          pubId: l.publication_id, pubName: l.pub_name, adSize: l.ad_size, dims: l.dims,
          adW: Number(l.ad_width), adH: Number(l.ad_height),
          issueId: l.issue_id, issueLabel: l.issue_label, issueDate: l.issue_date,
          price: Number(l.price),
        })),
      })));
    }
    setProposalsLoaded(true);
  }, [proposalsLoaded]);

  // Stories — loaded when Editorial or Flatplan needs them
  // Paginates through all stories to bypass the 1,000-row PostgREST limit
  const [storiesLoaded, setStoriesLoaded] = useState(false);
  const loadStories = useCallback(async () => {
    if (storiesLoaded || !isOnline()) return;
    let allStories = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase.from('stories').select('*')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (!data || data.length === 0) break;
      allStories = allStories.concat(data);
      if (data.length < pageSize) break;
      page++;
    }
    if (allStories.length > 0) setStories(allStories.map(s => ({ id: s.id, title: s.title, author: s.author, status: s.status, publication: s.publication_id, assignedTo: s.assigned_to || '', dueDate: s.due_date, images: s.images, wordCount: s.word_count, category: s.category, issueId: s.issue_id || '' })));
    setStoriesLoaded(true);
  }, [storiesLoaded]);

  // Billing module (invoices, payments)
  const [billingLoaded, setBillingLoaded] = useState(false);
  const loadBilling = useCallback(async () => {
    if (billingLoaded || !isOnline()) return;
    const [invRes, invLinesRes, payRes] = await Promise.all([
      supabase.from('invoices').select('*').order('issue_date', { ascending: false }),
      supabase.from('invoice_lines').select('*'),
      supabase.from('payments').select('*').order('received_at', { ascending: false }),
    ]);
    if (invRes.data) {
      setInvoices(invRes.data.map(i => ({
        id: i.id, invoiceNumber: i.invoice_number, clientId: i.client_id, subscriberId: i.subscriber_id,
        status: i.status, billingSchedule: i.billing_schedule,
        subtotal: Number(i.subtotal), discountPct: Number(i.discount_pct), discountAmount: Number(i.discount_amount),
        tax: Number(i.tax), total: Number(i.total), amountPaid: Number(i.amount_paid), balanceDue: Number(i.balance_due),
        monthlyAmount: Number(i.monthly_amount), planMonths: i.plan_months,
        issueDate: i.issue_date, dueDate: i.due_date,
        notes: i.notes || '', qbInvoiceId: i.qb_invoice_id, createdAt: i.created_at,
        lines: (invLinesRes.data || []).filter(l => l.invoice_id === i.id).map(l => ({
          id: l.id, description: l.description, productType: l.product_type,
          saleId: l.sale_id, legalNoticeId: l.legal_notice_id,
          quantity: l.quantity, unitPrice: Number(l.unit_price), total: Number(l.total),
        })),
      })));
    }
    if (payRes.data) setPayments(payRes.data.map(p => ({
      id: p.id, invoiceId: p.invoice_id, amount: Number(p.amount), method: p.method,
      transactionId: p.transaction_id, lastFour: p.last_four,
      qbPaymentId: p.qb_payment_id, notes: p.notes || '', receivedAt: p.received_at,
    })));
    setBillingLoaded(true);
  }, [billingLoaded]);

  // Circulation module (subscribers, subscriptions, drop locations, drivers, routes)
  const [circulationLoaded, setCirculationLoaded] = useState(false);
  const loadCirculation = useCallback(async (force) => {
    if ((circulationLoaded && !force) || !isOnline()) return;
    const [subRes, subscriptionsRes, mailListRes, dropRes, dropPubRes, driverRes, routeRes, stopRes] = await Promise.all([
      fetchAllRows('subscribers', 'last_name'),
      fetchAllRows('subscriptions', 'created_at', false),
      supabase.from('mailing_lists').select('*').order('generated_at', { ascending: false }).limit(100),
      supabase.from('drop_locations').select('*').order('name'),
      supabase.from('drop_location_pubs').select('*'),
      supabase.from('drivers').select('*').order('name'),
      supabase.from('driver_routes').select('*').order('name'),
      supabase.from('route_stops').select('*').order('sort_order'),
    ]);
    if (subRes.length > 0) setSubscribers(subRes.map(s => ({
      id: s.id, type: s.type, status: s.status, firstName: s.first_name, lastName: s.last_name, email: s.email, phone: s.phone,
      companyName: s.company_name || '', addressLine1: s.address_line1, addressLine2: s.address_line2, city: s.city, state: s.state, zip: s.zip,
      publicationId: s.publication_id, startDate: s.start_date, expiryDate: s.expiry_date,
      renewalDate: s.renewal_date, amountPaid: Number(s.amount_paid), source: s.source, notes: s.notes,
      stripeCustomerId: s.stripe_customer_id, createdAt: s.created_at,
    })));
    if (subscriptionsRes.length > 0) setSubscriptions(subscriptionsRes.map(s => ({
      id: s.id, subscriberId: s.subscriber_id, publicationId: s.publication_id, tier: s.tier,
      status: s.status, startDate: s.start_date, endDate: s.end_date, autoRenew: s.auto_renew,
      amountPaid: Number(s.amount_paid), paymentMethod: s.payment_method, copies: s.copies,
      notes: s.notes, priceDescription: s.price_description,
      pausedAt: s.paused_at, cancelledAt: s.cancelled_at, createdAt: s.created_at,
    })));
    if (mailListRes.data) setMailingLists(mailListRes.data.map(m => ({
      id: m.id, publicationId: m.publication_id, issueId: m.issue_id, generatedAt: m.generated_at,
      recordCount: m.record_count, csvUrl: m.csv_url, xlsxUrl: m.xlsx_url,
      sentToPrinter: m.sent_to_printer, sentToFulfillment: m.sent_to_fulfillment,
      generatedBy: m.generated_by, notes: m.notes,
    })));
    if (dropRes.data) setDropLocations(dropRes.data.map(d => ({
      id: d.id, name: d.name, locationType: d.location_type, address: d.address, city: d.city, state: d.state, zip: d.zip,
      latitude: d.latitude, longitude: d.longitude, contactName: d.contact_name, contactPhone: d.contact_phone,
      notes: d.notes, isActive: d.is_active, createdAt: d.created_at,
    })));
    if (dropPubRes.data) setDropLocationPubs(dropPubRes.data.map(dp => ({ id: dp.id, dropLocationId: dp.drop_location_id, publicationId: dp.publication_id, quantity: dp.quantity })));
    if (driverRes.data) setDrivers(driverRes.data.map(d => ({ id: d.id, name: d.name, phone: d.phone, email: d.email, flatFee: Number(d.flat_fee), notes: d.notes, isActive: d.is_active, createdAt: d.created_at })));
    if (routeRes.data) setDriverRoutes(routeRes.data.map(r => ({ id: r.id, driverId: r.driver_id, name: r.name, frequency: r.frequency, publicationId: r.publication_id, notes: r.notes, isActive: r.is_active, createdAt: r.created_at })));
    if (stopRes.data) setRouteStops(stopRes.data.map(s => ({ id: s.id, routeId: s.route_id, dropLocationId: s.drop_location_id, stopOrder: s.stop_order })));
    setCirculationLoaded(true);
  }, [circulationLoaded]);

  // Editions (issuu_editions)
  const [editionsLoaded, setEditionsLoaded] = useState(false);
  const loadEditions = useCallback(async () => {
    if (editionsLoaded || !isOnline()) return;
    const { data } = await supabase.from('issuu_editions').select('*').order('publish_date', { ascending: false });
    if (data) setEditions(data.map(e => ({
      id: e.id, publicationId: e.publication_id, title: e.title, slug: e.slug,
      pdfUrl: e.pdf_url, coverImageUrl: e.cover_image_url, publishDate: e.publish_date,
      pageCount: e.page_count, embedUrl: e.embed_url, isFeatured: e.is_featured,
    })));
    setEditionsLoaded(true);
  }, [editionsLoaded]);

  // Ad Inquiries (inbound from StellarPress)
  const [inquiriesLoaded, setInquiriesLoaded] = useState(false);
  const loadInquiries = useCallback(async () => {
    if (inquiriesLoaded || !isOnline()) return;
    const { data } = await supabase.from('ad_inquiries').select('*').order('created_at', { ascending: false });
    if (data) setAdInquiries(data);
    setInquiriesLoaded(true);
  }, [inquiriesLoaded]);

  const updateInquiry = useCallback(async (id, updates) => {
    setAdInquiries(prev => prev.map(inq => inq.id === id ? { ...inq, ...updates } : inq));
    if (isOnline()) await supabase.from('ad_inquiries').update(updates).eq('id', id);
  }, []);

  // Service Desk
  const [ticketsLoaded, setTicketsLoaded] = useState(false);
  const loadTickets = useCallback(async () => {
    if (ticketsLoaded || !isOnline()) return;
    const [ticketRes, ticketCommentRes] = await Promise.all([
      supabase.from('service_tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('ticket_comments').select('*').order('created_at'),
    ]);
    if (ticketRes.data) setTickets(ticketRes.data.map(t => ({
      id: t.id, channel: t.channel, category: t.category, status: t.status, priority: t.priority,
      contactName: t.contact_name, contactEmail: t.contact_email, contactPhone: t.contact_phone,
      subject: t.subject, description: t.description,
      clientId: t.client_id, subscriberId: t.subscriber_id, publicationId: t.publication_id, issueId: t.issue_id,
      assignedTo: t.assigned_to, escalatedTo: t.escalated_to,
      resolutionNotes: t.resolution_notes, resolvedAt: t.resolved_at, createdAt: t.created_at, updatedAt: t.updated_at,
    })));
    if (ticketCommentRes.data) setTicketComments(ticketCommentRes.data.map(c => ({
      id: c.id, ticketId: c.ticket_id, authorId: c.author_id, authorName: c.author_name,
      note: c.note, isInternal: c.is_internal, createdAt: c.created_at,
    })));
    setTicketsLoaded(true);
  }, [ticketsLoaded]);

  // Legal Notices
  const [legalsLoaded, setLegalsLoaded] = useState(false);
  const loadLegals = useCallback(async () => {
    if (legalsLoaded || !isOnline()) return;
    const [legalRes, legalIssueRes] = await Promise.all([
      supabase.from('legal_notices').select('*').order('created_at', { ascending: false }),
      supabase.from('legal_notice_issues').select('*'),
    ]);
    if (legalRes.data) setLegalNotices(legalRes.data.map(n => ({
      id: n.id, clientId: n.client_id, contactName: n.contact_name, contactEmail: n.contact_email,
      contactPhone: n.contact_phone, organization: n.organization,
      noticeType: n.notice_type, status: n.status, content: n.content,
      publicationId: n.publication_id, issuesRequested: n.issues_requested,
      ratePerLine: Number(n.rate_per_line), lineCount: n.line_count,
      flatRate: Number(n.flat_rate), totalAmount: Number(n.total_amount),
      proofApprovedAt: n.proof_approved_at, placedBy: n.placed_by,
      verifiedBy: n.verified_by, verifiedAt: n.verified_at,
      invoiceId: n.invoice_id, notes: n.notes, createdAt: n.created_at,
    })));
    if (legalIssueRes.data) setLegalNoticeIssues(legalIssueRes.data.map(li => ({
      id: li.id, legalNoticeId: li.legal_notice_id, issueId: li.issue_id, pageNumber: li.page_number,
    })));
    setLegalsLoaded(true);
  }, [legalsLoaded]);

  // Creative Jobs
  const [creativeLoaded, setCreativeLoaded] = useState(false);
  const loadCreative = useCallback(async () => {
    if (creativeLoaded || !isOnline()) return;
    const { data } = await supabase.from('creative_jobs').select('*').order('created_at', { ascending: false });
    if (data) setCreativeJobs(data.map(j => ({
      id: j.id, clientId: j.client_id, title: j.title, description: j.description,
      jobType: j.job_type, status: j.status, assignedTo: j.assigned_to,
      quotedAmount: Number(j.quoted_amount), finalAmount: Number(j.final_amount),
      invoiceId: j.invoice_id, dueDate: j.due_date, completedAt: j.completed_at,
      notes: j.notes, createdAt: j.created_at,
    })));
    setCreativeLoaded(true);
  }, [creativeLoaded]);

  // Commissions — loaded when Commissions tab is opened
  const [commissionsLoaded, setCommissionsLoaded] = useState(false);
  const loadCommissions = useCallback(async () => {
    if (commissionsLoaded || !isOnline()) return;
    const [ledgerRes, payoutsRes, goalsRes, assignRes, ratesRes] = await Promise.all([
      supabase.from('commission_ledger').select('*').order('created_at', { ascending: false }),
      supabase.from('commission_payouts').select('*').order('created_at', { ascending: false }),
      supabase.from('commission_issue_goals').select('*'),
      supabase.from('salesperson_pub_assignments').select('*'),
      supabase.from('commission_rates').select('*'),
    ]);
    if (ledgerRes.data) setCommissionLedger(ledgerRes.data.map(l => ({
      id: l.id, saleId: l.sale_id, salespersonId: l.salesperson_id, publicationId: l.publication_id,
      issueId: l.issue_id, clientId: l.client_id, saleAmount: Number(l.sale_amount),
      sharePct: Number(l.share_pct), commissionRate: Number(l.commission_rate),
      commissionAmount: Number(l.commission_amount), bonusPct: Number(l.bonus_pct),
      bonusAmount: Number(l.bonus_amount), totalAmount: Number(l.total_amount),
      status: l.status, issuePublished: l.issue_published, invoicePaid: l.invoice_paid,
      earnedAt: l.earned_at, payoutId: l.payout_id, paidAt: l.paid_at, period: l.period,
      notes: l.notes, createdAt: l.created_at,
    })));
    if (payoutsRes.data) setCommissionPayouts(payoutsRes.data.map(p => ({
      id: p.id, salespersonId: p.salesperson_id, period: p.period,
      totalAmount: Number(p.total_amount), commissionCount: p.commission_count,
      status: p.status, approvedBy: p.approved_by, approvedAt: p.approved_at,
      paidAt: p.paid_at, notes: p.notes, createdAt: p.created_at,
    })));
    if (goalsRes.data) setCommissionGoals(goalsRes.data.map(g => ({
      id: g.id, issueId: g.issue_id, publicationId: g.publication_id, goal: Number(g.goal),
    })));
    if (assignRes.data) setSalespersonPubAssignments(assignRes.data.map(a => ({
      id: a.id, salespersonId: a.salesperson_id, publicationId: a.publication_id,
      percentage: Number(a.percentage), isActive: a.is_active,
    })));
    if (ratesRes.data) setCommissionRates(ratesRes.data.map(r => ({
      id: r.id, salespersonId: r.salesperson_id, publicationId: r.publication_id,
      productType: r.product_type, rate: Number(r.rate),
    })));
    setCommissionsLoaded(true);
  }, [commissionsLoaded]);

  // ============================================================
  // Write helpers — original tables (unchanged)
  // ============================================================

  const updatePubGoal = useCallback(async (pubId, goal) => {
    setPubs(pp => pp.map(p => p.id === pubId ? { ...p, defaultRevenueGoal: goal } : p));
    if (isOnline()) await supabase.from('publications').update({ default_revenue_goal: goal }).eq('id', pubId);
  }, []);

  const updateIssueGoal = useCallback(async (issueId, goal) => {
    setIssues(ii => ii.map(i => i.id === issueId ? { ...i, revenueGoal: goal } : i));
    if (isOnline()) await supabase.from('issues').update({ revenue_goal: goal }).eq('id', issueId);
  }, []);

  const updateClient = useCallback(async (id, changes) => {
    setClients(cl => cl.map(c => c.id === id ? { ...c, ...changes } : c));
    if (isOnline()) {
      const db = {};
      if (changes.name !== undefined) db.name = changes.name;
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.totalSpend !== undefined) db.total_spend = changes.totalSpend;
      if (changes.notes !== undefined) db.notes = changes.notes;
      if (changes.leadSource !== undefined) db.lead_source = changes.leadSource;
      if (changes.industries !== undefined) db.industries = changes.industries;
      if (changes.interestedPubs !== undefined) db.interested_pubs = changes.interestedPubs;
      if (changes.category !== undefined) db.category = changes.category;
      if (Object.keys(db).length) await supabase.from('clients').update(db).eq('id', id);
    }
  }, []);

  const insertClient = useCallback(async (client) => {
    if (isOnline()) {
      const { data } = await supabase.from('clients').insert({
        name: client.name, status: client.status || 'Lead', total_spend: client.totalSpend || 0,
        category: client.category || '', notes: client.notes || '',
        lead_source: client.leadSource || '', industries: client.industries || [],
        interested_pubs: client.interestedPubs || [],
      }).select().single();
      if (data) {
        const nc = { ...client, id: data.id, status: data.status, comms: [], yearlySummary: [] };
        setClients(cl => [...cl, nc]);
        if (client.contacts?.length) {
          const validContacts = client.contacts.filter(ct => ct.name || ct.email);
          if (validContacts.length) await supabase.from('client_contacts').insert(validContacts.map(ct => ({ client_id: data.id, name: ct.name || '', email: ct.email || '', phone: ct.phone || '', role: ct.role || 'Business Owner' })));
        }
        return nc;
      }
    }
    const nc = { ...client, id: 'c' + Date.now() };
    setClients(cl => [...cl, nc]);
    return nc;
  }, []);

  const updateStory = useCallback(async (id, changes) => {
    setStories(st => st.map(s => s.id === id ? { ...s, ...changes } : s));
    if (isOnline()) {
      const db = {};
      if (changes.title !== undefined) db.title = changes.title;
      if (changes.author !== undefined) db.author = changes.author;
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.publication !== undefined) db.publication_id = changes.publication;
      if (changes.issueId !== undefined) db.issue_id = changes.issueId;
      if (changes.dueDate !== undefined) db.due_date = changes.dueDate;
      if (changes.wordCount !== undefined) db.word_count = changes.wordCount;
      if (changes.category !== undefined) db.category = changes.category;
      if (changes.page !== undefined) db.page = changes.page;
      if (changes.sentToWeb !== undefined) db.sent_to_web = changes.sentToWeb;
      if (changes.body !== undefined) db.body = changes.body;
      if (changes.images !== undefined) db.images = changes.images;
      if (Object.keys(db).length) await supabase.from('stories').update(db).eq('id', id);
    }
  }, []);

  const insertStory = useCallback(async (story) => {
    if (isOnline()) {
      const { data } = await supabase.from('stories').insert({
        title: story.title, author: story.author, publication_id: story.publication,
        issue_id: story.issueId || null, category: story.category || 'News',
        status: story.status || 'Draft', word_count: story.wordCount || 500,
        due_date: story.dueDate || null, page: story.page || null,
      }).select().single();
      if (data) { const ns = { ...story, id: data.id }; setStories(st => [...st, ns]); return ns; }
    }
    const ns = { ...story, id: 'st-' + Date.now() }; setStories(st => [...st, ns]); return ns;
  }, []);

  const publishStory = useCallback(async (id, { title, body, excerpt, category, siteId, featuredImageUrl, seoTitle, seoDescription, scheduledAt }) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const categorySlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const autoExcerpt = excerpt || (body ? body.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim().slice(0, 200) + '…' : '');
    const isScheduled = scheduledAt && new Date(scheduledAt) > new Date();
    const status = isScheduled ? 'Scheduled' : 'Published';
    const publishedAt = isScheduled ? null : new Date().toISOString();

    const changes = {
      status, slug, body, excerpt: autoExcerpt,
      category, category_slug: categorySlug,
      site_id: siteId, featured_image_url: featuredImageUrl || null,
      seo_title: seoTitle || title, seo_description: seoDescription || autoExcerpt,
      published_at: publishedAt, scheduled_at: scheduledAt || null,
      sent_to_web: true,
    };

    setStories(st => st.map(s => s.id === id ? { ...s, ...changes, sentToWeb: true } : s));
    if (isOnline()) {
      await supabase.from('stories').update(changes).eq('id', id);
    }
    return { slug, status };
  }, []);

  const unpublishStory = useCallback(async (id) => {
    setStories(st => st.map(s => s.id === id ? { ...s, status: 'Approved', sentToWeb: false } : s));
    if (isOnline()) {
      await supabase.from('stories').update({ status: 'Approved', sent_to_web: false }).eq('id', id);
    }
  }, []);

  const deleteStory = useCallback(async (id) => {
    setStories(st => st.filter(s => s.id !== id));
    if (isOnline()) await supabase.from('stories').delete().eq('id', id);
  }, []);

  const updateSale = useCallback(async (id, changes) => {
    setSales(sl => sl.map(s => s.id === id ? { ...s, ...changes } : s));
    if (isOnline()) {
      const db = {};
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.amount !== undefined) db.amount = changes.amount;
      if (changes.closedAt !== undefined) db.closed_at = changes.closedAt;
      if (changes.nextAction !== undefined) { db.next_action_type = changes.nextAction?.type || null; db.next_action_label = changes.nextAction?.label || null; }
      if (changes.nextActionDate !== undefined) db.next_action_date = changes.nextActionDate || null;
      if (changes.page !== undefined) db.page = changes.page;
      if (changes.gridRow !== undefined) db.grid_row = changes.gridRow;
      if (changes.gridCol !== undefined) db.grid_col = changes.gridCol;
      if (changes.proposalId !== undefined) db.proposal_id = changes.proposalId;
      if (Object.keys(db).length) await supabase.from('sales').update(db).eq('id', id);
    }
  }, []);

  const insertSale = useCallback(async (sale) => {
    if (isOnline()) {
      const { data } = await supabase.from('sales').insert({ client_id: sale.clientId, publication_id: sale.publication, issue_id: sale.issueId || null, ad_type: sale.type || 'TBD', ad_size: sale.size || '', ad_width: sale.adW || 0, ad_height: sale.adH || 0, amount: sale.amount || 0, status: sale.status || 'Discovery', date: sale.date, next_action_type: sale.nextAction?.type || null, next_action_label: sale.nextAction?.label || null, next_action_date: sale.nextActionDate || null, proposal_id: sale.proposalId || null, notes: sale.oppNotes || [], product_type: sale.productType || 'display_print' }).select().single();
      if (data) { const ns = { ...sale, id: data.id }; setSales(sl => [...sl, ns]); return ns; }
    }
    const ns = { ...sale, id: 'sl' + Date.now() }; setSales(sl => [...sl, ns]); return ns;
  }, []);

  const deleteSale = useCallback(async (id) => {
    setSales(sl => sl.filter(s => s.id !== id));
    if (isOnline()) await supabase.from('sales').delete().eq('id', id);
  }, []);

  const deleteClient = useCallback(async (id) => {
    setClients(cl => cl.filter(c => c.id !== id));
    if (isOnline()) await supabase.from('clients').delete().eq('id', id);
  }, []);

  const updateProposal = useCallback(async (id, changes) => {
    setProposals(pr => pr.map(p => p.id === id ? { ...p, ...changes } : p));
    if (isOnline()) {
      const db = {};
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.closedAt !== undefined) db.closed_at = changes.closedAt;
      if (changes.name !== undefined) db.name = changes.name;
      if (changes.total !== undefined) db.total = changes.total;
      if (changes.sentTo !== undefined) db.sent_to = changes.sentTo;
      if (changes.sentAt !== undefined) db.sent_at = changes.sentAt;
      if (changes.signedAt !== undefined) db.signed_at = changes.signedAt;
      if (changes.signatureUrl !== undefined) db.signature_url = changes.signatureUrl;
      if (changes.assignedTo !== undefined) db.assigned_to = changes.assignedTo;
      if (changes.discountPct !== undefined) db.discount_pct = changes.discountPct;
      if (changes.renewalDate !== undefined) db.renewal_date = changes.renewalDate;
      if (changes.payPlan !== undefined) db.pay_plan = changes.payPlan;
      if (changes.monthly !== undefined) db.monthly = changes.monthly;
      if (changes.contractId !== undefined) db.contract_id = changes.contractId;
      if (changes.convertedAt !== undefined) db.converted_at = changes.convertedAt;
      if (Object.keys(db).length) await supabase.from('proposals').update(db).eq('id', id);
    }
  }, []);

  const insertProposal = useCallback(async (proposal) => {
    if (isOnline()) {
      const { data } = await supabase.from('proposals').insert({
        client_id: proposal.clientId, name: proposal.name, term: proposal.term,
        term_months: proposal.termMonths, total: proposal.total, pay_plan: proposal.payPlan,
        monthly: proposal.monthly, status: proposal.status || 'Draft', date: proposal.date,
        renewal_date: proposal.renewalDate || null, sent_to: proposal.sentTo || [],
        assigned_to: proposal.assignedTo || null, discount_pct: proposal.discountPct || 0,
        sent_at: proposal.sentAt || null,
      }).select().single();
      if (data && proposal.lines?.length) {
        await supabase.from('proposal_lines').insert(proposal.lines.map((l, i) => ({
          proposal_id: data.id, publication_id: l.pubId, pub_name: l.pubName,
          ad_size: l.adSize, dims: l.dims || '', ad_width: l.adW || 0, ad_height: l.adH || 0,
          issue_id: l.issueId, issue_label: l.issueLabel, issue_date: l.issueDate || null,
          price: l.price, sort_order: i, notes: l.notes || null,
        })));
        const np = { ...proposal, id: data.id }; setProposals(pr => [...pr, np]); return np;
      }
    }
    const np = { ...proposal, id: 'prop' + Date.now() }; setProposals(pr => [...pr, np]); return np;
  }, []);

  // Convert an Approved/Signed proposal → contract + sales orders via database function
  const convertProposal = useCallback(async (proposalId) => {
    if (!isOnline()) return { error: 'Offline — cannot convert' };
    const { data, error } = await supabase.rpc('convert_proposal_to_contract', { p_proposal_id: proposalId });
    if (error) return { error: error.message };
    if (data?.error) return data;
    // Success — reload the affected data into local state
    // Update proposal status locally
    setProposals(pr => pr.map(p => p.id === proposalId ? { ...p, status: 'Converted', contractId: data.contract_id, convertedAt: new Date().toISOString() } : p));
    // Reload sales to pick up the new orders
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 12);
    let newSales = []; let pg = 0;
    while (true) {
      const { data: sd } = await supabase.from('sales').select('*').gte('date', cutoff.toISOString().slice(0, 10)).order('date', { ascending: false }).range(pg * 1000, (pg + 1) * 1000 - 1);
      if (!sd || sd.length === 0) break;
      newSales = newSales.concat(sd);
      if (sd.length < 1000) break;
      pg++;
    }
    if (newSales.length > 0) setSales(newSales.map(s => ({
      id: s.id, clientId: s.client_id, publication: s.publication_id, issueId: s.issue_id,
      type: s.ad_type, size: s.ad_size, adW: Number(s.ad_width), adH: Number(s.ad_height),
      amount: Number(s.amount), status: s.status, date: s.date, closedAt: s.closed_at,
      page: s.page, pagePos: s.grid_row != null ? { row: s.grid_row, col: s.grid_col } : null,
      nextAction: s.next_action_type ? { type: s.next_action_type, label: s.next_action_label } : null,
      nextActionDate: s.next_action_date || '', proposalId: s.proposal_id, oppNotes: s.notes || [],
      productType: s.product_type || 'display_print', placementNotes: s.placement_notes || '',
      contractId: s.contract_id || null,
    })));
    return data;
  }, []);

  const addComm = useCallback(async (clientId, comm) => {
    setClients(cl => cl.map(c => c.id === clientId ? { ...c, comms: [...(c.comms || []), comm] } : c));
    if (isOnline()) await supabase.from('communications').insert({ client_id: clientId, type: comm.type || 'Comment', author_name: comm.author, note: comm.note, date: comm.date });
  }, []);

  const addNotification = useCallback(async (text, route) => {
    const notif = { id: 'n' + Date.now(), text, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), read: false, route };
    setNotifications(n => [notif, ...n]);
    if (isOnline()) await supabase.from('notifications').insert({ text, route });
  }, []);

  const updateNotification = useCallback(async (id, changes) => {
    setNotifications(n => n.map(x => x.id === id ? { ...x, ...changes } : x));
    if (isOnline() && changes.read !== undefined) await supabase.from('notifications').update({ read: changes.read }).eq('id', id);
  }, []);

  const logActivity = useCallback(async (text, type, clientId, clientName) => {
    if (isOnline()) await supabase.from('activity_log').insert({ text, type, client_id: clientId, client_name: clientName });
  }, []);

  // ============================================================
  // Write helpers — Phase 2 tables
  // ============================================================

  // ─── Invoices ───────────────────────────────────────────
  const insertInvoice = useCallback(async (inv) => {
    if (isOnline()) {
      const { data } = await supabase.from('invoices').insert({
        invoice_number: inv.invoiceNumber, client_id: inv.clientId, subscriber_id: inv.subscriberId || null,
        status: inv.status || 'draft', billing_schedule: inv.billingSchedule || 'lump_sum',
        subtotal: inv.subtotal, discount_pct: inv.discountPct || 0, discount_amount: inv.discountAmount || 0,
        tax: inv.tax || 0, total: inv.total, amount_paid: inv.amountPaid || 0, balance_due: inv.balanceDue || inv.total,
        monthly_amount: inv.monthlyAmount || 0, plan_months: inv.planMonths || 0,
        issue_date: inv.issueDate, due_date: inv.dueDate, notes: inv.notes || '',
      }).select().single();
      if (data && inv.lines?.length) {
        await supabase.from('invoice_lines').insert(inv.lines.map((l, i) => ({
          invoice_id: data.id, description: l.description, product_type: l.productType || null,
          sale_id: l.saleId || null, legal_notice_id: l.legalNoticeId || null,
          quantity: l.quantity || 1, unit_price: l.unitPrice, total: l.total, sort_order: i,
        })));
        return { ...inv, id: data.id };
      }
    }
    return { ...inv, id: inv.id || 'inv-' + Date.now() };
  }, []);

  const updateInvoice = useCallback(async (id, changes) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
    if (isOnline()) {
      const db = {};
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.amountPaid !== undefined) db.amount_paid = changes.amountPaid;
      if (changes.balanceDue !== undefined) db.balance_due = changes.balanceDue;
      if (Object.keys(db).length) await supabase.from('invoices').update(db).eq('id', id);
    }
  }, []);

  // ─── Payments ───────────────────────────────────────────
  const insertPayment = useCallback(async (pay) => {
    if (isOnline()) {
      const { data } = await supabase.from('payments').insert({
        invoice_id: pay.invoiceId, amount: pay.amount, method: pay.method,
        last_four: pay.lastFour || null, notes: pay.notes || '',
      }).select().single();
      if (data) { setPayments(prev => [...prev, { ...pay, id: data.id }]); return { ...pay, id: data.id }; }
    }
    const np = { ...pay, id: pay.id || 'pay-' + Date.now() }; setPayments(prev => [...prev, np]); return np;
  }, []);

  // ─── Subscribers ────────────────────────────────────────
  const insertSubscriber = useCallback(async (sub) => {
    if (isOnline()) {
      const { data } = await supabase.from('subscribers').insert({
        type: sub.type, status: sub.status || 'active', first_name: sub.firstName, last_name: sub.lastName,
        email: sub.email, phone: sub.phone, address_line1: sub.addressLine1 || '', address_line2: sub.addressLine2 || '',
        city: sub.city || '', state: sub.state || '', zip: sub.zip || '',
        publication_id: sub.publicationId, start_date: sub.startDate, expiry_date: sub.expiryDate || null,
        renewal_date: sub.renewalDate || null, amount_paid: sub.amountPaid || 0, source: sub.source || '', notes: sub.notes || '',
      }).select().single();
      if (data) return { ...sub, id: data.id };
    }
    return { ...sub, id: sub.id || 'sub-' + Date.now() };
  }, []);

  const updateSubscriber = useCallback(async (id, changes) => {
    setSubscribers(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    if (isOnline()) {
      const db = {};
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.renewalDate !== undefined) db.renewal_date = changes.renewalDate;
      if (changes.expiryDate !== undefined) db.expiry_date = changes.expiryDate;
      if (Object.keys(db).length) await supabase.from('subscribers').update(db).eq('id', id);
    }
  }, []);

  // ─── Service Tickets ────────────────────────────────────
  const insertTicket = useCallback(async (ticket) => {
    if (isOnline()) {
      const { data } = await supabase.from('service_tickets').insert({
        channel: ticket.channel, category: ticket.category, status: ticket.status || 'open', priority: ticket.priority || 0,
        contact_name: ticket.contactName, contact_email: ticket.contactEmail, contact_phone: ticket.contactPhone,
        subject: ticket.subject, description: ticket.description || '',
        client_id: ticket.clientId || null, publication_id: ticket.publicationId || null,
        assigned_to: ticket.assignedTo || null,
      }).select().single();
      if (data) return { ...ticket, id: data.id, createdAt: data.created_at };
    }
    return { ...ticket, id: ticket.id || 'tk-' + Date.now() };
  }, []);

  const updateTicket = useCallback(async (id, changes) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
    if (isOnline()) {
      const db = {};
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.escalatedTo !== undefined) db.escalated_to = changes.escalatedTo;
      if (changes.resolvedAt !== undefined) db.resolved_at = changes.resolvedAt;
      if (changes.resolutionNotes !== undefined) db.resolution_notes = changes.resolutionNotes;
      if (Object.keys(db).length) await supabase.from('service_tickets').update(db).eq('id', id);
    }
  }, []);

  const insertTicketComment = useCallback(async (comment) => {
    if (isOnline()) {
      const { data } = await supabase.from('ticket_comments').insert({
        ticket_id: comment.ticketId, author_id: comment.authorId || null,
        author_name: comment.authorName, note: comment.note, is_internal: comment.isInternal || false,
      }).select().single();
      if (data) { setTicketComments(prev => [...prev, { ...comment, id: data.id, createdAt: data.created_at }]); return; }
    }
    setTicketComments(prev => [...prev, { ...comment, id: comment.id || 'tc-' + Date.now() }]);
  }, []);

  // ─── Legal Notices ──────────────────────────────────────
  const insertLegalNotice = useCallback(async (notice) => {
    if (isOnline()) {
      const { data } = await supabase.from('legal_notices').insert({
        client_id: notice.clientId || null, contact_name: notice.contactName,
        contact_email: notice.contactEmail || '', contact_phone: notice.contactPhone || '',
        organization: notice.organization || '', notice_type: notice.noticeType, status: notice.status || 'received',
        content: notice.content, publication_id: notice.publicationId,
        issues_requested: notice.issuesRequested || 1,
        rate_per_line: notice.ratePerLine || 0, line_count: notice.lineCount || 0,
        flat_rate: notice.flatRate || 0, total_amount: notice.totalAmount || 0, notes: notice.notes || '',
      }).select().single();
      if (data) return { ...notice, id: data.id, createdAt: data.created_at };
    }
    return { ...notice, id: notice.id || 'ln-' + Date.now() };
  }, []);

  const updateLegalNotice = useCallback(async (id, changes) => {
    setLegalNotices(prev => prev.map(n => n.id === id ? { ...n, ...changes } : n));
    if (isOnline()) {
      const db = {};
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.proofApprovedAt !== undefined) db.proof_approved_at = changes.proofApprovedAt;
      if (changes.placedBy !== undefined) db.placed_by = changes.placedBy;
      if (changes.verifiedBy !== undefined) db.verified_by = changes.verifiedBy;
      if (changes.verifiedAt !== undefined) db.verified_at = changes.verifiedAt;
      if (changes.totalAmount !== undefined) db.total_amount = changes.totalAmount;
      if (Object.keys(db).length) await supabase.from('legal_notices').update(db).eq('id', id);
    }
  }, []);

  // ─── Creative Jobs ──────────────────────────────────────
  const insertCreativeJob = useCallback(async (job) => {
    if (isOnline()) {
      const { data } = await supabase.from('creative_jobs').insert({
        client_id: job.clientId, title: job.title, description: job.description || '',
        job_type: job.jobType || 'design', status: job.status || 'quoted',
        assigned_to: job.assignedTo || null, quoted_amount: job.quotedAmount || 0,
        final_amount: job.finalAmount || 0, due_date: job.dueDate || null, notes: job.notes || '',
      }).select().single();
      if (data) return { ...job, id: data.id, createdAt: data.created_at };
    }
    return { ...job, id: job.id || 'cj-' + Date.now() };
  }, []);

  const updateCreativeJob = useCallback(async (id, changes) => {
    setCreativeJobs(prev => prev.map(j => j.id === id ? { ...j, ...changes } : j));
    if (isOnline()) {
      const db = {};
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.completedAt !== undefined) db.completed_at = changes.completedAt;
      if (changes.finalAmount !== undefined) db.final_amount = changes.finalAmount;
      if (changes.assignedTo !== undefined) db.assigned_to = changes.assignedTo;
      if (Object.keys(db).length) await supabase.from('creative_jobs').update(db).eq('id', id);
    }
  }, []);

  // ─── Drop Locations ─────────────────────────────────────
  const insertDropLocation = useCallback(async (loc) => {
    if (isOnline()) {
      const { data } = await supabase.from('drop_locations').insert({
        name: loc.name, location_type: loc.locationType || 'newsstand', address: loc.address,
        city: loc.city || '', state: loc.state || 'CA', zip: loc.zip || '',
        contact_name: loc.contactName || '', contact_phone: loc.contactPhone || '', notes: loc.notes || '',
      }).select().single();
      if (data) return { ...loc, id: data.id };
    }
    return { ...loc, id: loc.id || 'loc-' + Date.now() };
  }, []);

  // ─── Drivers ────────────────────────────────────────────
  const insertDriver = useCallback(async (driver) => {
    if (isOnline()) {
      const { data } = await supabase.from('drivers').insert({
        name: driver.name, phone: driver.phone || '', email: driver.email || '', flat_fee: driver.flatFee || 0, notes: driver.notes || '',
      }).select().single();
      if (data) return { ...driver, id: data.id };
    }
    return { ...driver, id: driver.id || 'drv-' + Date.now() };
  }, []);

  // ============================================================
  // Commission write helpers
  // ============================================================

  const upsertPubAssignment = useCallback(async (assign) => {
    if (isOnline()) {
      const { data } = await supabase.from('salesperson_pub_assignments').upsert({
        salesperson_id: assign.salespersonId, publication_id: assign.publicationId,
        percentage: assign.percentage || 100, is_active: assign.isActive !== false,
      }, { onConflict: 'salesperson_id,publication_id' }).select().single();
      if (data) {
        const na = { id: data.id, salespersonId: data.salesperson_id, publicationId: data.publication_id, percentage: Number(data.percentage), isActive: data.is_active };
        setSalespersonPubAssignments(prev => [...prev.filter(a => !(a.salespersonId === na.salespersonId && a.publicationId === na.publicationId)), na]);
        return na;
      }
    }
  }, []);

  const deletePubAssignment = useCallback(async (salespersonId, publicationId) => {
    setSalespersonPubAssignments(prev => prev.filter(a => !(a.salespersonId === salespersonId && a.publicationId === publicationId)));
    if (isOnline()) await supabase.from('salesperson_pub_assignments').delete().eq('salesperson_id', salespersonId).eq('publication_id', publicationId);
  }, []);

  const upsertCommissionRate = useCallback(async (rate) => {
    if (isOnline()) {
      const { data } = await supabase.from('commission_rates').upsert({
        id: rate.id || undefined, salesperson_id: rate.salespersonId,
        publication_id: rate.publicationId || null, product_type: rate.productType || null,
        rate: rate.rate,
      }).select().single();
      if (data) {
        const nr = { id: data.id, salespersonId: data.salesperson_id, publicationId: data.publication_id, productType: data.product_type, rate: Number(data.rate) };
        setCommissionRates(prev => [...prev.filter(r => r.id !== nr.id), nr]);
        return nr;
      }
    }
  }, []);

  const deleteCommissionRate = useCallback(async (rateId) => {
    setCommissionRates(prev => prev.filter(r => r.id !== rateId));
    if (isOnline()) await supabase.from('commission_rates').delete().eq('id', rateId);
  }, []);

  const upsertIssueGoal = useCallback(async (goal) => {
    if (isOnline()) {
      const { data } = await supabase.from('commission_issue_goals').upsert({
        issue_id: goal.issueId, publication_id: goal.publicationId, goal: goal.goal,
      }, { onConflict: 'issue_id' }).select().single();
      if (data) {
        const ng = { id: data.id, issueId: data.issue_id, publicationId: data.publication_id, goal: Number(data.goal) };
        setCommissionGoals(prev => [...prev.filter(g => g.issueId !== ng.issueId), ng]);
        return ng;
      }
    }
  }, []);

  const calculateSaleCommission = useCallback(async (saleId) => {
    if (!isOnline()) return { error: 'Offline' };
    const { data, error } = await supabase.rpc('calculate_sale_commission', { p_sale_id: saleId });
    if (error) return { error: error.message };
    return data;
  }, []);

  const recalculateAllCommissions = useCallback(async () => {
    if (!isOnline()) return { error: 'Offline' };
    const { data, error } = await supabase.rpc('recalculate_all_commissions');
    if (error) return { error: error.message };
    // Reload ledger after recalculation
    const { data: ledger } = await supabase.from('commission_ledger').select('*').order('created_at', { ascending: false });
    if (ledger) setCommissionLedger(ledger.map(l => ({
      id: l.id, saleId: l.sale_id, salespersonId: l.salesperson_id, publicationId: l.publication_id,
      issueId: l.issue_id, clientId: l.client_id, saleAmount: Number(l.sale_amount),
      sharePct: Number(l.share_pct), commissionRate: Number(l.commission_rate),
      commissionAmount: Number(l.commission_amount), bonusPct: Number(l.bonus_pct),
      bonusAmount: Number(l.bonus_amount), totalAmount: Number(l.total_amount),
      status: l.status, issuePublished: l.issue_published, invoicePaid: l.invoice_paid,
      earnedAt: l.earned_at, payoutId: l.payout_id, paidAt: l.paid_at, period: l.period,
      notes: l.notes, createdAt: l.created_at,
    })));
    return data;
  }, []);

  const markCommissionsPaid = useCallback(async (ledgerIds, salespersonId, period) => {
    if (!isOnline()) return;
    // Create payout record
    const totalAmount = commissionLedger.filter(l => ledgerIds.includes(l.id)).reduce((s, l) => s + l.totalAmount, 0);
    const { data: payout } = await supabase.from('commission_payouts').insert({
      salesperson_id: salespersonId, period, total_amount: totalAmount,
      commission_count: ledgerIds.length, status: 'paid', paid_at: new Date().toISOString(),
    }).select().single();
    if (payout) {
      // Update ledger entries
      await supabase.from('commission_ledger').update({
        status: 'paid', payout_id: payout.id, paid_at: new Date().toISOString(),
      }).in('id', ledgerIds);
      // Update local state
      setCommissionLedger(prev => prev.map(l => ledgerIds.includes(l.id) ? { ...l, status: 'paid', payoutId: payout.id, paidAt: new Date().toISOString() } : l));
      setCommissionPayouts(prev => [{ id: payout.id, salespersonId, period, totalAmount: Number(payout.total_amount), commissionCount: payout.commission_count, status: 'paid', paidAt: payout.paid_at, createdAt: payout.created_at }, ...prev]);
    }
  }, [commissionLedger]);

  // ============================================================
  // Outreach campaign helpers
  // ============================================================

  const [outreachLoaded, setOutreachLoaded] = useState(false);
  const loadOutreach = useCallback(async () => {
    if (outreachLoaded || !isOnline()) return;
    const [campRes, entryRes] = await Promise.all([
      supabase.from('outreach_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('outreach_entries').select('*').order('created_at', { ascending: false }),
    ]);
    if (campRes.data) setOutreachCampaigns(campRes.data.map(c => ({
      id: c.id, name: c.name, description: c.description, status: c.status,
      filters: c.filters || {}, createdBy: c.created_by, assignedTo: c.assigned_to,
      clientCount: c.client_count, contactedCount: c.contacted_count, wonBackCount: c.won_back_count,
      createdAt: c.created_at, updatedAt: c.updated_at,
    })));
    if (entryRes.data) setOutreachEntries(entryRes.data.map(e => ({
      id: e.id, campaignId: e.campaign_id, clientId: e.client_id, status: e.status,
      contactedAt: e.contacted_at, contactedVia: e.contacted_via, responseAt: e.response_at,
      responseNotes: e.response_notes, meetingDate: e.meeting_date, meetingNotes: e.meeting_notes,
      wonBackAt: e.won_back_at, wonBackAmount: Number(e.won_back_amount || 0),
      assignedTo: e.assigned_to, notes: e.notes, createdAt: e.created_at,
    })));
    setOutreachLoaded(true);
  }, [outreachLoaded]);

  const insertCampaign = useCallback(async (campaign) => {
    if (!isOnline()) return;
    const { data } = await supabase.from('outreach_campaigns').insert({
      name: campaign.name, description: campaign.description || '',
      status: campaign.status || 'draft', filters: campaign.filters || {},
      created_by: campaign.createdBy || null, assigned_to: campaign.assignedTo || null,
      client_count: campaign.clientCount || 0,
    }).select().single();
    if (data) {
      const nc = { id: data.id, name: data.name, description: data.description, status: data.status, filters: data.filters, createdBy: data.created_by, assignedTo: data.assigned_to, clientCount: data.client_count, contactedCount: 0, wonBackCount: 0, createdAt: data.created_at };
      setOutreachCampaigns(prev => [nc, ...prev]);
      return nc;
    }
  }, []);

  const updateCampaign = useCallback(async (id, changes) => {
    setOutreachCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    if (isOnline()) {
      const db = {};
      if (changes.name !== undefined) db.name = changes.name;
      if (changes.description !== undefined) db.description = changes.description;
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.filters !== undefined) db.filters = changes.filters;
      if (changes.assignedTo !== undefined) db.assigned_to = changes.assignedTo;
      if (changes.clientCount !== undefined) db.client_count = changes.clientCount;
      if (changes.contactedCount !== undefined) db.contacted_count = changes.contactedCount;
      if (changes.wonBackCount !== undefined) db.won_back_count = changes.wonBackCount;
      db.updated_at = new Date().toISOString();
      if (Object.keys(db).length) await supabase.from('outreach_campaigns').update(db).eq('id', id);
    }
  }, []);

  const insertOutreachEntries = useCallback(async (campaignId, clientIds) => {
    if (!isOnline() || !clientIds.length) return;
    const rows = clientIds.map(cid => ({ campaign_id: campaignId, client_id: cid, status: 'queued' }));
    // Insert in batches of 200
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { data } = await supabase.from('outreach_entries').upsert(batch, { onConflict: 'campaign_id,client_id' }).select();
      if (data) {
        const newEntries = data.map(e => ({ id: e.id, campaignId: e.campaign_id, clientId: e.client_id, status: e.status, contactedAt: e.contacted_at, contactedVia: e.contacted_via, responseAt: e.response_at, responseNotes: e.response_notes, meetingDate: e.meeting_date, meetingNotes: e.meeting_notes, wonBackAt: e.won_back_at, wonBackAmount: 0, assignedTo: e.assigned_to, notes: e.notes, createdAt: e.created_at }));
        setOutreachEntries(prev => [...prev.filter(e => !newEntries.some(n => n.id === e.id)), ...newEntries]);
      }
    }
  }, []);

  const updateOutreachEntry = useCallback(async (id, changes) => {
    setOutreachEntries(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
    if (isOnline()) {
      const db = {};
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.contactedAt !== undefined) db.contacted_at = changes.contactedAt;
      if (changes.contactedVia !== undefined) db.contacted_via = changes.contactedVia;
      if (changes.responseAt !== undefined) db.response_at = changes.responseAt;
      if (changes.responseNotes !== undefined) db.response_notes = changes.responseNotes;
      if (changes.meetingDate !== undefined) db.meeting_date = changes.meetingDate;
      if (changes.meetingNotes !== undefined) db.meeting_notes = changes.meetingNotes;
      if (changes.wonBackAt !== undefined) db.won_back_at = changes.wonBackAt;
      if (changes.wonBackAmount !== undefined) db.won_back_amount = changes.wonBackAmount;
      if (changes.assignedTo !== undefined) db.assigned_to = changes.assignedTo;
      if (changes.notes !== undefined) db.notes = changes.notes;
      db.updated_at = new Date().toISOString();
      await supabase.from('outreach_entries').update(db).eq('id', id);
    }
  }, []);

  // ============================================================
  // MyPriorities — per-salesperson priority list (cap 13)
  // ============================================================
  const [prioritiesLoaded, setPrioritiesLoaded] = useState(false);
  const loadPriorities = useCallback(async () => {
    if (prioritiesLoaded || !isOnline()) return;
    const { data } = await supabase.from('my_priorities').select('*').order('sort_order');
    if (data) setMyPriorities(data.map(p => ({
      id: p.id, teamMemberId: p.team_member_id, clientId: p.client_id,
      signalType: p.signal_type, signalDetail: p.signal_detail,
      addedAt: p.added_at, addedBy: p.added_by,
      highlighted: p.highlighted, highlightedBy: p.highlighted_by, highlightedAt: p.highlighted_at,
      sortOrder: p.sort_order,
    })));
    setPrioritiesLoaded(true);
  }, [prioritiesLoaded]);

  const addPriority = useCallback(async (teamMemberId, clientId, signalType, signalDetail) => {
    // Check cap
    const existing = myPriorities.filter(p => p.teamMemberId === teamMemberId);
    if (existing.length >= 13) return { error: 'Priority list is full (13 max)' };
    if (existing.some(p => p.clientId === clientId)) return { error: 'Client already in priorities' };
    const sortOrder = existing.length;
    const newP = { id: 'tmp-' + Date.now(), teamMemberId, clientId, signalType, signalDetail: signalDetail || '', addedAt: new Date().toISOString(), addedBy: teamMemberId, highlighted: false, highlightedBy: null, highlightedAt: null, sortOrder };
    setMyPriorities(prev => [...prev, newP]);
    if (isOnline()) {
      const { data } = await supabase.from('my_priorities').insert({
        team_member_id: teamMemberId, client_id: clientId,
        signal_type: signalType, signal_detail: signalDetail || '',
        added_by: teamMemberId, sort_order: sortOrder,
      }).select().single();
      if (data) setMyPriorities(prev => prev.map(p => p.id === newP.id ? { ...newP, id: data.id } : p));
    }
    return { success: true };
  }, [myPriorities]);

  const removePriority = useCallback(async (priorityId) => {
    setMyPriorities(prev => prev.filter(p => p.id !== priorityId));
    if (isOnline()) await supabase.from('my_priorities').delete().eq('id', priorityId);
  }, []);

  const highlightPriority = useCallback(async (priorityId, highlightedBy) => {
    setMyPriorities(prev => prev.map(p => p.id === priorityId ? { ...p, highlighted: !p.highlighted, highlightedBy: !p.highlighted ? highlightedBy : null, highlightedAt: !p.highlighted ? new Date().toISOString() : null } : p));
    if (isOnline()) {
      const p = myPriorities.find(p => p.id === priorityId);
      const newVal = !(p?.highlighted);
      await supabase.from('my_priorities').update({
        highlighted: newVal, highlighted_by: newVal ? highlightedBy : null,
        highlighted_at: newVal ? new Date().toISOString() : null,
      }).eq('id', priorityId);
    }
  }, [myPriorities]);

  // Auto-remove priorities when a sale closes for that client
  const autoRemoveClosedPriorities = useCallback(async (clientId) => {
    const toRemove = myPriorities.filter(p => p.clientId === clientId);
    if (toRemove.length === 0) return;
    setMyPriorities(prev => prev.filter(p => p.clientId !== clientId));
    if (isOnline()) {
      await supabase.from('my_priorities').delete().in('id', toRemove.map(p => p.id));
    }
  }, [myPriorities]);

  // ============================================================
  // Publications, Issues, Ad Sizes, Team — write helpers
  // ============================================================

  const insertPublication = useCallback(async (pub) => {
    const dbPub = {
      id: pub.id, name: pub.name, color: pub.color || '#4B8BF5', type: pub.type,
      page_count: pub.pageCount || 24, width: pub.width, height: pub.height,
      frequency: pub.frequency, circulation: pub.circ || 0,
      pub_day_of_week: pub.pubDayOfWeek, press_day_pattern: pub.pressDayPattern || '',
      ad_close_offset_days: pub.adCloseOffsetDays || 2, ed_close_offset_days: pub.edCloseOffsetDays || 3,
      press_dates_of_month: pub.pressDatesOfMonth || [],
    };
    if (isOnline()) {
      const { data, error } = await supabase.from('publications').upsert(dbPub).select().single();
      if (error) console.error('insertPublication error:', error);
      if (data) {
        const np = { ...pub, id: data.id };
        setPubs(ps => [...ps.filter(p => p.id !== data.id), np]);
        return np;
      }
    }
    setPubs(ps => [...ps.filter(p => p.id !== pub.id), pub]);
    return pub;
  }, []);

  const updatePublication = useCallback(async (id, changes) => {
    setPubs(ps => ps.map(p => p.id === id ? { ...p, ...changes } : p));
    if (isOnline()) {
      const db = {};
      if (changes.name !== undefined) db.name = changes.name;
      if (changes.color !== undefined) db.color = changes.color;
      if (changes.type !== undefined) db.type = changes.type;
      if (changes.pageCount !== undefined) db.page_count = changes.pageCount;
      if (changes.frequency !== undefined) db.frequency = changes.frequency;
      if (changes.circ !== undefined) db.circulation = changes.circ;
      if (changes.adCloseOffsetDays !== undefined) db.ad_close_offset_days = changes.adCloseOffsetDays;
      if (changes.edCloseOffsetDays !== undefined) db.ed_close_offset_days = changes.edCloseOffsetDays;
      if (changes.pressDayPattern !== undefined) db.press_day_pattern = changes.pressDayPattern;
      if (changes.pressDatesOfMonth !== undefined) db.press_dates_of_month = changes.pressDatesOfMonth;
      if (Object.keys(db).length) await supabase.from('publications').update(db).eq('id', id);
    }
  }, []);

  const insertAdSizes = useCallback(async (pubId, adSizes) => {
    if (isOnline()) {
      // Delete existing ad sizes for this pub, then insert new ones
      await supabase.from('ad_sizes').delete().eq('pub_id', pubId);
      if (adSizes.length > 0) {
        const rows = adSizes.map((a, i) => ({
          pub_id: pubId, name: a.name, dims: a.dims || '', width: a.w || a.width || 0,
          height: a.h || a.height || 0, rate: a.rate, rate_6: a.rate6 || a.rate_6 || 0,
          rate_12: a.rate12 || a.rate_12 || 0, rate_18: a.rate18 || a.rate_18 || 0, sort_order: i,
        }));
        await supabase.from('ad_sizes').insert(rows);
      }
    }
  }, []);

  const insertIssuesBatch = useCallback(async (pubId, issuesList, startDate) => {
    // Delete existing issues for this pub from startDate forward
    if (isOnline()) {
      await supabase.from('issues').delete().eq('pub_id', pubId).gte('date', startDate);
    }
    // Remove from local state
    setIssues(prev => prev.filter(i => !(i.pubId === pubId && i.date >= startDate)));

    // Insert new issues
    if (isOnline() && issuesList.length > 0) {
      // Supabase insert in batches of 100
      for (let i = 0; i < issuesList.length; i += 100) {
        const batch = issuesList.slice(i, i + 100).map(iss => ({
          id: iss.id, pub_id: pubId, label: iss.label, date: iss.date,
          page_count: iss.pageCount, ad_deadline: iss.adDeadline, ed_deadline: iss.edDeadline,
          status: iss.status || 'Scheduled',
        }));
        const { error } = await supabase.from('issues').insert(batch);
        if (error) console.error('insertIssuesBatch error:', error);
      }
    }
    // Update local state
    setIssues(prev => [...prev, ...issuesList]);
  }, []);

  const deleteIssuesByPub = useCallback(async (pubId, fromDate) => {
    setIssues(prev => prev.filter(i => !(i.pubId === pubId && i.date >= fromDate)));
    if (isOnline()) {
      await supabase.from('issues').delete().eq('pub_id', pubId).gte('date', fromDate);
    }
  }, []);

  const updateTeamMember = useCallback(async (id, changes) => {
    setTeam(t => t.map(m => m.id === id ? { ...m, ...changes } : m));
    if (isOnline()) {
      const db = {};
      if (changes.name !== undefined) db.name = changes.name;
      if (changes.role !== undefined) db.role = changes.role;
      if (changes.email !== undefined) db.email = changes.email;
      if (changes.phone !== undefined) db.phone = changes.phone;
      if (changes.permissions !== undefined) db.permissions = changes.permissions;
      if (changes.assignedPubs !== undefined) db.assigned_pubs = changes.assignedPubs;
      if (changes.isActive !== undefined) db.is_active = changes.isActive;
      if (changes.modulePermissions !== undefined) db.module_permissions = changes.modulePermissions;
      if (changes.commissionTrigger !== undefined) db.commission_trigger = changes.commissionTrigger;
      if (changes.commissionDefaultRate !== undefined) db.commission_default_rate = changes.commissionDefaultRate;
      if (Object.keys(db).length) await supabase.from('team_members').update(db).eq('id', id);
    }
  }, []);

  // Lazy loaders for heavy data (loaded on-demand, not on initial page load)
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const loadContracts = useCallback(async () => {
    if (contractsLoaded || !isOnline()) return;
    const [allContracts, allContractLines] = await Promise.all([
      fetchAllRows('contracts', 'start_date', false),
      fetchAllRows('contract_lines', null),
    ]);
    if (allContracts.length > 0) {
      const linesByContract = {};
      allContractLines.forEach(cl => {
        if (!linesByContract[cl.contract_id]) linesByContract[cl.contract_id] = [];
        linesByContract[cl.contract_id].push({
          id: cl.id, pubId: cl.publication_id, adSize: cl.ad_size,
          rate: Number(cl.rate), quantity: cl.quantity, lineTotal: Number(cl.line_total),
          sortOrder: cl.sort_order, notes: cl.notes || '',
        });
      });
      setContracts(allContracts.map(c => ({
        id: c.id, clientId: c.client_id, name: c.name, status: c.status,
        startDate: c.start_date, endDate: c.end_date,
        totalValue: Number(c.total_value), totalPaid: Number(c.total_paid),
        discountPct: Number(c.discount_pct), paymentTerms: c.payment_terms,
        assignedTo: c.assigned_to, notes: c.notes || '',
        isSynthetic: c.is_synthetic,
        lines: linesByContract[c.id] || [],
      })));
      setContractLines(allContractLines.map(cl => ({
        id: cl.id, contractId: cl.contract_id, pubId: cl.publication_id,
        adSize: cl.ad_size, rate: Number(cl.rate), quantity: cl.quantity,
        lineTotal: Number(cl.line_total),
      })));
    }
    setContractsLoaded(true);
  }, [contractsLoaded]);

  const [allSalesLoaded, setAllSalesLoaded] = useState(false);
  const loadAllSales = useCallback(async () => {
    if (allSalesLoaded || !isOnline()) return;
    const all = await fetchAllRows('sales', 'date', false);
    if (all.length > 0) {
      setSales(all.map(s => ({
        id: s.id, clientId: s.client_id, publication: s.publication_id, issueId: s.issue_id,
        type: s.ad_type, size: s.ad_size, adW: Number(s.ad_width), adH: Number(s.ad_height),
        amount: Number(s.amount), status: s.status, date: s.date, closedAt: s.closed_at,
        page: s.page, pagePos: s.grid_row != null ? { row: s.grid_row, col: s.grid_col } : null,
        nextAction: s.next_action_type ? { type: s.next_action_type, label: s.next_action_label } : null,
        nextActionDate: s.next_action_date || '', proposalId: s.proposal_id, oppNotes: s.notes || [],
        productType: s.product_type || 'display_print', placementNotes: s.placement_notes || '',
        contractId: s.contract_id || null,
      })));
    }
    setAllSalesLoaded(true);
  }, [allSalesLoaded]);

  // ============================================================
  // Context value — memoized to prevent unnecessary re-renders
  // ============================================================
  const value = useMemo(() => ({
    // Original data + setters
    pubs, setPubs, issues, setIssues, stories, setStories, clients, setClients,
    sales, setSales, proposals, setProposals, team, setTeam, notifications, setNotifications,
    // Phase 2 data + setters
    invoices, setInvoices, payments, setPayments,
    subscribers, setSubscribers, dropLocations, setDropLocations, dropLocationPubs, setDropLocationPubs,
    drivers, setDrivers, driverRoutes, setDriverRoutes, routeStops, setRouteStops,
    tickets, setTickets, ticketComments, setTicketComments,
    legalNotices, setLegalNotices, legalNoticeIssues, setLegalNoticeIssues,
    creativeJobs, setCreativeJobs,
    contracts, setContracts, contractLines, setContractLines,
    salesSummary, setSalesSummary,
    loadContracts, loadAllSales, contractsLoaded, allSalesLoaded,
    loadFullSales, fullSalesLoaded,
    // Lazy loaders for module-specific data
    loadClientDetails, clientDetailsLoaded,
    loadProposals, proposalsLoaded,
    loadStories, storiesLoaded,
    loadBilling, billingLoaded,
    loadCirculation, circulationLoaded,
    loadTickets, ticketsLoaded,
    loadLegals, legalsLoaded,
    loadCreative, creativeLoaded,
    // Commission data + loaders
    loadCommissions, commissionsLoaded,
    commissionLedger, setCommissionLedger, commissionPayouts, setCommissionPayouts,
    commissionGoals, setCommissionGoals, commissionRates, setCommissionRates,
    salespersonPubAssignments, setSalespersonPubAssignments,
    upsertPubAssignment, deletePubAssignment, upsertCommissionRate, deleteCommissionRate,
    upsertIssueGoal, calculateSaleCommission, recalculateAllCommissions, markCommissionsPaid,
    // Outreach
    loadOutreach, outreachLoaded, outreachCampaigns, setOutreachCampaigns, outreachEntries, setOutreachEntries,
    insertCampaign, updateCampaign, insertOutreachEntries, updateOutreachEntry,
    // MyPriorities
    loadPriorities, prioritiesLoaded, myPriorities, setMyPriorities,
    addPriority, removePriority, highlightPriority, autoRemoveClosedPriorities,
    loaded,
    // Original write helpers
    updateClient, insertClient, deleteClient,
    updatePubGoal, updateIssueGoal,
    updateStory, insertStory, deleteStory, publishStory, unpublishStory,
    updateSale, insertSale, deleteSale,
    updateProposal, insertProposal, convertProposal, addComm, addNotification, updateNotification, logActivity,
    // Phase 2 write helpers
    insertInvoice, updateInvoice, insertPayment,
    insertSubscriber, updateSubscriber,
    // Subscription management
    subscriptions, setSubscriptions, subscriptionPayments, setSubscriptionPayments,
    mailingLists, setMailingLists,
    // Editions
    editions, setEditions, loadEditions, editionsLoaded,
    // Ad Inquiries
    adInquiries, setAdInquiries, loadInquiries, inquiriesLoaded, updateInquiry,
    insertTicket, updateTicket, insertTicketComment,
    insertLegalNotice, updateLegalNotice,
    insertCreativeJob, updateCreativeJob,
    insertDropLocation, insertDriver,
    // Publications, Issues, Team
    insertPublication, updatePublication, insertAdSizes,
    insertIssuesBatch, deleteIssuesByPub,
    updateTeamMember,
  }), [
    // Data arrays (re-render consumers only when actual data changes)
    pubs, issues, stories, clients, sales, proposals, team, notifications,
    invoices, payments, subscribers, dropLocations, dropLocationPubs,
    drivers, driverRoutes, routeStops, tickets, ticketComments,
    legalNotices, legalNoticeIssues, creativeJobs, contracts, contractLines, salesSummary,
    commissionLedger, commissionPayouts, commissionGoals, commissionRates, salespersonPubAssignments,
    outreachCampaigns, outreachEntries, myPriorities,
    subscriptions, subscriptionPayments, mailingLists, editions, adInquiries,
    // Loaded flags
    loaded, fullSalesLoaded, clientDetailsLoaded, proposalsLoaded, storiesLoaded,
    billingLoaded, circulationLoaded, ticketsLoaded, legalsLoaded, creativeLoaded,
    commissionsLoaded, outreachLoaded, prioritiesLoaded, contractsLoaded, allSalesLoaded, editionsLoaded, inquiriesLoaded,
    // Callbacks are stable (useCallback) so they won't trigger re-renders
    loadFullSales, loadClientDetails, loadProposals, loadStories, loadBilling,
    loadCirculation, loadTickets, loadLegals, loadCreative, loadCommissions,
    loadOutreach, loadPriorities, loadContracts, loadAllSales, loadEditions, loadInquiries,
  ]);

  return <DataContext.Provider value={value}>{loaded ? children : null}</DataContext.Provider>;
}

export const useAppData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useAppData must be used within DataProvider');
  return ctx;
};
