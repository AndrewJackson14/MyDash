import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import { supabase, isOnline } from '../lib/supabase';
import { deriveTransactionType } from '../lib/qboTransactionType';

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
  const [bills, setBills] = useState([]);
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
  // Media assets — queried lazily when Media Library or a media-picker opens
  const [mediaAssets, setMediaAssets] = useState([]);
  const [mediaAssetsLoaded, setMediaAssetsLoaded] = useState(false);
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
  // Editions (editions)
  const [editions, setEditions] = useState([]);
  // Ad inquiries (inbound from StellarPress)
  const [adInquiries, setAdInquiries] = useState([]);
  // Ad projects — design workflow state, one per sale (see migration 027)
  const [adProjects, setAdProjects] = useState([]);
  const [adProjectsLoaded, setAdProjectsLoaded] = useState(false);

  const [loaded, setLoaded] = useState(!isOnline());

  // Failsafe timeout
  useEffect(() => {
    if (!isOnline()) return;
    const timer = setTimeout(() => { if (!loaded) { console.warn('Supabase timeout — loading local'); setLoaded(true); } }, 5000);
    return () => clearTimeout(timer);
  }, [loaded]);

  // Realtime: listen for new ad inquiries — ref-counted so the channel
  // only opens while SalesCRM or DashboardV2 is mounted. Users on other
  // modules (Circulation, Analytics, Mail) don't pay for this WebSocket.
  const [inquiriesWatchers, setInquiriesWatchers] = useState(0);
  const retainInquiriesRealtime = useCallback(() => {
    setInquiriesWatchers(n => n + 1);
    return () => setInquiriesWatchers(n => Math.max(0, n - 1));
  }, []);
  useEffect(() => {
    if (!isOnline() || inquiriesWatchers === 0) return;
    const channel = supabase.channel('ad_inquiries_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ad_inquiries' }, (payload) => {
        setAdInquiries(prev => [payload.new, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [inquiriesWatchers]);

  // Realtime: proposals status changes + new notifications
  useEffect(() => {
    if (!isOnline()) return;
    const channel = supabase.channel('proposals_notifs_realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proposals' }, (payload) => {
        const p = payload.new;
        setProposals(prev => prev.map(x => x.id === p.id ? {
          ...x, status: p.status, contractId: p.contract_id, signedAt: p.signed_at, convertedAt: p.converted_at, history: p.history || x.history,
        } : x));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const n = payload.new;
        setNotifications(prev => [{ id: n.id, text: n.title || '', detail: n.detail || '', type: n.type || '', time: new Date(n.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), read: n.read, route: n.link || '' }, ...prev]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contracts' }, (payload) => {
        const c = payload.new;
        setContracts(prev => {
          if (prev.some(x => x.id === c.id)) return prev;
          return [{ id: c.id, clientId: c.client_id, name: c.name, status: c.status, startDate: c.start_date, endDate: c.end_date, totalValue: Number(c.total_value), totalPaid: Number(c.total_paid), discountPct: Number(c.discount_pct), paymentTerms: c.payment_terms, assignedTo: c.assigned_to, notes: c.notes || '', isSynthetic: c.is_synthetic, lines: [] }, ...prev];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contracts' }, (payload) => {
        const c = payload.new;
        setContracts(prev => prev.map(x => x.id === c.id ? { ...x, status: c.status, totalPaid: Number(c.total_paid), notes: c.notes || '' } : x));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, (payload) => {
        const s = payload.new;
        setSales(prev => {
          if (prev.some(x => x.id === s.id)) return prev;
          return [{ id: s.id, clientId: s.client_id, publication: s.publication_id, issueId: s.issue_id, type: s.ad_type, size: s.ad_size, adW: Number(s.ad_width), adH: Number(s.ad_height), amount: Number(s.amount), status: s.status, date: s.date, closedAt: s.closed_at, contractId: s.contract_id || null, proposalId: s.proposal_id, productType: s.product_type || 'display_print', assignedTo: s.assigned_to || null }, ...prev];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Helper to fetch all rows from a table (bypasses 1000-row PostgREST limit)
  const fetchAllRows = useCallback(async (table, orderCol, ascending = true, fields = '*') => {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      let q = supabase.from(table).select(fields).range(from, from + pageSize - 1);
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
        const clientSelect = 'id,name,status,total_spend,category,address,city,state,zip,rep_id,client_code,last_art_source,contract_end_date,last_ad_date,credit_balance,card_last4,card_brand,card_exp,invoice_prefix,lapsed_reason,billing_email,billing_cc_emails,billing_address,billing_address2,billing_city,billing_state,billing_zip';
        const saleSelect = 'id,client_id,publication_id,issue_id,ad_type,ad_size,ad_width,ad_height,amount,status,date,closed_at,page,grid_row,grid_col,next_action_type,next_action_label,next_action_date,proposal_id,notes,product_type,placement_notes,contract_id,assigned_to';
        const issueSelect = 'id,pub_id,label,date,page_count,ad_deadline,ed_deadline,status,revenue_goal,sent_to_press_at';
        // Keyset pagination — uses PK index (id > cursor), no OFFSET. Earlier
        // OFFSET pagination silently dropped pages on Postgres statement
        // timeouts at offset ~18k+, so boot would load only the first ~3860
        // sales of 41k+ and the rest of the app would render against partial
        // data with no error surfaced.
        const fetchAllRows = async (table, select, opts = {}) => {
          const all = [];
          let cursor = null;
          while (true) {
            let q = supabase.from(table).select(select).order('id', { ascending: true }).limit(1000);
            if (cursor) q = q.gt('id', cursor);
            if (opts.gte) q = q.gte(opts.gte[0], opts.gte[1]);
            const { data, error } = await q;
            if (error) { console.error(`fetchAllRows(${table}) error:`, error); throw error; }
            if (!data?.length) break;
            all.push(...data);
            cursor = data[data.length - 1].id;
            if (data.length < 1000) break;
          }
          return all;
        };

        // Narrow column lists on boot — the transforms below only use these
        // specific fields. Pulls ~40% less per row over the wire.
        const pubSelect = 'id,name,color,type,page_count,width,height,frequency,circulation,has_website,website_url,dormant,default_revenue_goal,site_settings';
        // rate_type / rate_amount / availability landed via the
        // add_freelancer_rate_columns migration. They are nullable and only
        // populated for freelancers; non-freelancers leave them NULL.
        const teamSelect = 'id,auth_id,name,role,email,phone,alerts,assigned_pubs,permissions,module_permissions,alert_preferences,is_hidden,is_active,is_freelance,specialty,rate_type,rate_amount,availability,commission_trigger,commission_default_rate,commission_payout_frequency';
        const [pubsRes, teamRes, notifsRes, adSizesRes] = await Promise.all([
          supabase.from('publications').select(pubSelect).order('name'),
          supabase.from('team_members').select(teamSelect).order('name'),
          supabase.from('notifications').select('id,title,text,detail,type,created_at,read,link,route').order('created_at', { ascending: false }).limit(50),
          supabase.from('ad_sizes').select('*').order('sort_order'),
        ]);

        // Paginate clients, issues, and sales in parallel
        const [allClientsRaw, allIssuesRaw, allSalesRaw] = await Promise.all([
          fetchAllRows('clients', clientSelect, { order: 'name' }),
          fetchAllRows('issues', issueSelect, { order: 'date' }),
          fetchAllRows('sales', saleSelect, { order: 'date', orderOpts: { ascending: false }, gte: ['date', cutoff] }),
        ]);

        console.log('Boot:', { pubs: pubsRes.data?.length, clients: allClientsRaw.length, issues: allIssuesRaw.length, sales: allSalesRaw.length });

        console.time('boot-transform');

        if (pubsRes.data && adSizesRes.data) {
          setPubs(pubsRes.data.map(p => ({
            id: p.id, name: p.name, color: p.color, type: p.type,
            pageCount: p.page_count, width: Number(p.width), height: Number(p.height),
            frequency: p.frequency, circ: p.circulation,
            hasWebsite: !!p.has_website, websiteUrl: p.website_url || '',
            dormant: !!p.dormant,
            defaultRevenueGoal: Number(p.default_revenue_goal || 0),
            sharedContentWith: Array.isArray(p.site_settings?.shared_content_with) ? p.site_settings.shared_content_with : [],
            adSizes: adSizesRes.data.filter(a => a.pub_id === p.id).map(a => ({
              name: a.name, dims: a.dims, w: Number(a.width), h: Number(a.height),
              rate: a.rate, rate6: a.rate_6, rate12: a.rate_12, rate18: a.rate_18,
            })),
          })));
        }

        if (teamRes.data) setTeam(teamRes.data.map(t => ({ id: t.id, authId: t.auth_id || null, name: t.name, role: t.role, email: t.email, phone: t.phone || '', alerts: t.alerts || [], pubs: t.assigned_pubs || ['all'], permissions: t.permissions || [], modulePermissions: t.module_permissions || [], alertPreferences: t.alert_preferences || null, isHidden: t.is_hidden || false, isActive: t.is_active !== false, isFreelance: t.is_freelance, specialty: t.specialty || null, rateType: t.rate_type || null, rateAmount: t.rate_amount != null ? Number(t.rate_amount) : null, availability: t.availability || null, commissionTrigger: t.commission_trigger || 'both', commissionDefaultRate: Number(t.commission_default_rate || 20), commissionPayoutFrequency: t.commission_payout_frequency || 'monthly' })));
        if (notifsRes.data) setNotifications(notifsRes.data.map(n => ({ id: n.id, text: n.title || n.text || '', detail: n.detail || '', type: n.type || '', time: new Date(n.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), read: n.read, route: n.link || n.route || '' })));

        if (allClientsRaw.length > 0) setClients(allClientsRaw.map(c => ({
          id: c.id, name: c.name, status: c.status, totalSpend: Number(c.total_spend),
          category: c.category || '', address: c.address || '', city: c.city || '', state: c.state || '', zip: c.zip || '',
          repId: c.rep_id || null, clientCode: c.client_code || null, lastArtSource: c.last_art_source || 'we_design', contractEndDate: c.contract_end_date || null, lastAdDate: c.last_ad_date || null, creditBalance: Number(c.credit_balance) || 0, cardLast4: c.card_last4 || null, cardBrand: c.card_brand || null, cardExp: c.card_exp || null,
          invoicePrefix: c.invoice_prefix || null,
          lapsedReason: c.lapsed_reason || null,
          creditHold: !!c.credit_hold, creditHoldReason: c.credit_hold_reason || null,
          billingEmail: c.billing_email || null,
          billingCcEmails: Array.isArray(c.billing_cc_emails) ? c.billing_cc_emails : [],
          billingAddress: c.billing_address || '',
          billingAddress2: c.billing_address2 || '',
          billingCity: c.billing_city || '',
          billingState: c.billing_state || '',
          billingZip: c.billing_zip || '',
          contacts: [], comms: [], yearlySummary: [],
        })));

        if (allIssuesRaw.length > 0) setIssues(allIssuesRaw.map(i => ({ id: i.id, pubId: i.pub_id, label: i.label, date: i.date, pageCount: i.page_count, adDeadline: i.ad_deadline, edDeadline: i.ed_deadline, status: i.status, revenueGoal: i.revenue_goal != null ? Number(i.revenue_goal) : null, sentToPressAt: i.sent_to_press_at || null })));

        if (allSalesRaw.length > 0) setSales(allSalesRaw.map(s => ({
          id: s.id, clientId: s.client_id, publication: s.publication_id, issueId: s.issue_id,
          type: s.ad_type, size: s.ad_size, adW: Number(s.ad_width), adH: Number(s.ad_height),
          amount: Number(s.amount), status: s.status, date: s.date, closedAt: s.closed_at,
          page: s.page, pagePos: s.grid_row != null ? { row: s.grid_row, col: s.grid_col } : null,
          nextAction: s.next_action_type ? { type: s.next_action_type, label: s.next_action_label } : null,
          nextActionDate: s.next_action_date || '', proposalId: s.proposal_id, oppNotes: s.notes || [],
          productType: s.product_type || 'display_print', placementNotes: s.placement_notes || '',
          contractId: s.contract_id || null,
          assignedTo: s.assigned_to || null,
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
      const { data } = await supabase.from('sales').select('id,client_id,publication_id,issue_id,ad_type,ad_size,ad_width,ad_height,amount,status,date,closed_at,page,grid_row,grid_col,next_action_type,next_action_label,next_action_date,proposal_id,notes,product_type,placement_notes,contract_id,assigned_to').gte('date', cutoff).order('date', { ascending: false }).range(sp * 1000, (sp + 1) * 1000 - 1);
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
      assignedTo: s.assigned_to || null,
    })));
    setFullSalesLoaded(true);
  }, [fullSalesLoaded]);

  // Load ALL sales (lifetime) for a specific client — loaded on-demand when viewing ClientProfile
  // so the user sees true lifetime totals instead of the 12-month window that loadFullSales caches.
  const loadedClientSalesRef = useRef(new Set());
  const loadSalesForClient = useCallback(async (clientId) => {
    if (!clientId || !isOnline() || loadedClientSalesRef.current.has(clientId)) return;
    loadedClientSalesRef.current.add(clientId);
    let all = [];
    let sp = 0;
    while (true) {
      const { data } = await supabase.from('sales')
        .select('id,client_id,publication_id,issue_id,ad_type,ad_size,ad_width,ad_height,amount,status,date,closed_at,page,grid_row,grid_col,next_action_type,next_action_label,next_action_date,proposal_id,notes,product_type,placement_notes,contract_id,assigned_to')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .range(sp * 1000, (sp + 1) * 1000 - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      sp++;
    }
    if (!all.length) return;
    const mapped = all.map(s => ({
      id: s.id, clientId: s.client_id, publication: s.publication_id, issueId: s.issue_id,
      type: s.ad_type, size: s.ad_size, adW: Number(s.ad_width), adH: Number(s.ad_height),
      amount: Number(s.amount), status: s.status, date: s.date, closedAt: s.closed_at,
      page: s.page, pagePos: s.grid_row != null ? { row: s.grid_row, col: s.grid_col } : null,
      nextAction: s.next_action_type ? { type: s.next_action_type, label: s.next_action_label } : null,
      nextActionDate: s.next_action_date || '', proposalId: s.proposal_id, oppNotes: s.notes || [],
      productType: s.product_type || 'display_print', placementNotes: s.placement_notes || '',
      contractId: s.contract_id || null,
      assignedTo: s.assigned_to || null,
    }));
    setSales(prev => {
      const byId = new Map(prev.map(s => [s.id, s]));
      for (const s of mapped) byId.set(s.id, s);
      return Array.from(byId.values());
    });
  }, []);

  // Client details (contacts, comms, sales summary) — loaded when opening a client profile
  const [clientDetailsLoaded, setClientDetailsLoaded] = useState(false);
  const loadClientDetails = useCallback(async () => {
    if (clientDetailsLoaded || !isOnline()) return;
    const [allContacts, allComms, allSalesSummary] = await Promise.all([
      fetchAllRows('client_contacts', null, true, 'id,client_id,name,email,phone,role,is_primary,notes'),
      fetchAllRows('communications', 'created_at', false, 'id,client_id,type,author_name,date,note'),
      fetchAllRows('client_sales_summary', null, true, 'client_id,publication_id,year,order_count,total_revenue,avg_order,ad_sizes,first_order_date,last_order_date'),
    ]);
    const contactsByClient = {};
    allContacts.forEach(ct => {
      if (!contactsByClient[ct.client_id]) contactsByClient[ct.client_id] = [];
      contactsByClient[ct.client_id].push({ id: ct.id, name: ct.name, email: ct.email, phone: ct.phone, role: ct.role, isPrimary: ct.is_primary, notes: ct.notes || "" });
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

  // Proposals — loaded when Sales module needs them.
  // Narrow boot select: history (JSONB, unbounded) is fetched lazily on
  // detail open via loadProposalHistory — keeps the list load fast even
  // after years of activity logs accumulate.
  const [proposalsLoaded, setProposalsLoaded] = useState(false);
  const proposalSelect = 'id,client_id,name,term,term_months,total,pay_plan,monthly,status,date,renewal_date,closed_at,sent_to,assigned_to,art_source,contract_id,brief_headline,brief_style,brief_colors,brief_instructions,signed_at,converted_at,sent_at';
  const loadProposals = useCallback(async () => {
    if (proposalsLoaded || !isOnline()) return;
    const [proposalsRes, propLinesRes] = await Promise.all([
      supabase.from('proposals').select(proposalSelect).order('date', { ascending: false }),
      supabase.from('proposal_lines').select('*'),
    ]);
    if (proposalsRes.data && propLinesRes.data) {
      setProposals(proposalsRes.data.map(p => ({
        id: p.id, clientId: p.client_id, name: p.name, term: p.term, termMonths: p.term_months,
        total: Number(p.total), payPlan: p.pay_plan, monthly: Number(p.monthly),
        status: p.status, date: p.date, renewalDate: p.renewal_date, closedAt: p.closed_at, sentTo: p.sent_to || [],
        assignedTo: p.assigned_to, artSource: p.art_source, contractId: p.contract_id,
        briefHeadline: p.brief_headline || null, briefStyle: p.brief_style || null, briefColors: p.brief_colors || null, briefInstructions: p.brief_instructions || null,
        signedAt: p.signed_at, convertedAt: p.converted_at, sentAt: p.sent_at,
        history: [],
        historyHydrated: false,
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

  // Lazy per-proposal history fetch. Used when the detail view opens so the
  // activity log appears without shipping every proposal's history on boot.
  const loadProposalHistory = useCallback(async (proposalId) => {
    if (!proposalId || !isOnline()) return;
    let alreadyHydrated = false;
    setProposals(prev => {
      const current = (prev || []).find(p => p.id === proposalId);
      if (current?.historyHydrated) alreadyHydrated = true;
      return prev;
    });
    if (alreadyHydrated) return;
    const { data, error } = await supabase
      .from('proposals')
      .select('history')
      .eq('id', proposalId)
      .maybeSingle();
    if (error) { console.error('loadProposalHistory error:', error); return; }
    setProposals(prev => (prev || []).map(p => p.id === proposalId ? {
      ...p, history: Array.isArray(data?.history) ? data.history : [], historyHydrated: true,
    } : p));
  }, []);

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
    if (allStories.length > 0) setStories(allStories.map(s => ({
      id: s.id, title: s.title, author: s.author, status: s.status,
      publication: s.publication_id,
      assignedTo: s.assigned_to || '',
      authorId: s.author_id || null,
      editorId: s.editor_id || null,
      assignedBy: s.assigned_by || null,
      editedBy: s.edited_by || null,
      dueDate: s.due_date,
      images: s.images, wordCount: s.word_count, category: s.category,
      issueId: s.issue_id || '',
      issue_id: s.issue_id || '',
      print_issue_id: s.print_issue_id || '',
      // Destination flags — single source of truth for "is this live"
      sent_to_web: s.sent_to_web === true,
      sent_to_print: s.sent_to_print === true,
      sentToWeb: s.sent_to_web === true,
      sentToPrint: s.sent_to_print === true,
      printPublishedAt: s.print_published_at || null,
      publishedAt: s.published_at || null,
      firstPublishedAt: s.first_published_at || null,
      // Correction-after-publish alert
      correctedAfterPublish: s.corrected_after_publish === true,
      lastCorrectionAt: s.last_correction_at || null,
      createdAt: s.created_at, updatedAt: s.updated_at,
    })));
    setStoriesLoaded(true);
  }, [storiesLoaded]);

  // Billing module (invoices, payments)
  const [billingLoaded, setBillingLoaded] = useState(false);
  const loadBilling = useCallback(async () => {
    if (billingLoaded || !isOnline()) return;

    // Keyset pagination — uses PK index (id > cursor), no OFFSET. Earlier
    // OFFSET-based pagination hit Postgres statement timeouts at offset
    // ~18k+, returning 500s and randomly partial UI numbers (AR aging
    // jumping $123K-$149K per refresh). Sequential but reliable.
    const fetchKeyset = async (table, select, applyFilter) => {
      const PAGE = 1000;
      const out = [];
      let cursor = null;
      while (true) {
        let q = supabase.from(table).select(select).order('id', { ascending: true }).limit(PAGE);
        if (cursor) q = q.gt('id', cursor);
        if (applyFilter) q = applyFilter(q);
        const res = await q;
        if (res.error) throw new Error(`fetchKeyset(${table}): ${res.error.message}`);
        if (!res.data || res.data.length === 0) break;
        out.push(...res.data);
        cursor = res.data[res.data.length - 1].id;
        if (res.data.length < PAGE) break;
      }
      return out;
    };

    // Initial load: only OPEN invoices (sent/overdue/partial/draft). Paid
    // history is lazy-loaded by loadPaidInvoices(since) when a view that
    // needs it opens (Overview "Paid This Month", Reports tabs, Invoices
    // tab Paid filter). Open set is ~600 rows; full set is 39k+ which
    // tripped the statement-timeout pagination bug above.
    const allInv = await fetchKeyset('invoices', '*', q => q.in('status', ['sent','overdue','partially_paid','draft']));
    const invIds = allInv.map(i => i.id);

    // Lines for the open invoices only (matched by invoice_id IN list)
    const allLines = invIds.length > 0
      ? await fetchKeyset('invoice_lines', 'id, invoice_id, sale_id, publication_id',
          q => q.in('invoice_id', invIds))
      : [];

    // Payments — keyset paginated for reliability (28k+ rows in production)
    const allPayments = await fetchKeyset('payments', '*');
    const payRes = { data: allPayments };

    // Index lines by invoice_id for fast lookup
    const linesByInv = {};
    for (const l of allLines) {
      if (!linesByInv[l.invoice_id]) linesByInv[l.invoice_id] = [];
      linesByInv[l.invoice_id].push(l);
    }

    if (allInv.length) {
      setInvoices(allInv.map(i => {
        const total = Number(i.total);
        const balance = Number(i.balance_due);
        return {
          id: i.id, invoiceNumber: i.invoice_number, clientId: i.client_id,
          status: i.status, billingSchedule: i.billing_schedule,
          subtotal: Number(i.subtotal),
          taxRate: Number(i.tax_rate || 0), taxAmount: Number(i.tax_amount || 0),
          total, balanceDue: balance,
          // Computed — invoices table has no amount_paid column; derive from total - balance_due
          amountPaid: total - balance,
          monthlyAmount: Number(i.monthly_amount || 0), planMonths: i.plan_months,
          issueDate: i.issue_date, dueDate: i.due_date,
          notes: i.notes || '', createdAt: i.created_at,
          lockedAt: i.locked_at || null,
          repId: i.rep_id || null, contractId: i.contract_id || null,
          chargeError: i.charge_error || null, autoChargeAttempts: i.auto_charge_attempts || 0,
          quickbooksId: i.quickbooks_id || null, quickbooksSyncedAt: i.quickbooks_synced_at || null, quickbooksSyncError: i.quickbooks_sync_error || null,
          // Skinny lines — only the fields needed by the Billing module's
          // filters (saleId for uninvoiced-sales detection, publicationId
          // for the aging report pub filter). Full line details
          // (description, quantity, unit_price, total) lazy-load via
          // loadInvoiceLines(invoiceId) when the detail modal opens.
          lines: (linesByInv[i.id] || []).map(l => ({
            id: l.id,
            saleId: l.sale_id,
            publicationId: l.publication_id,
          })),
          linesHydrated: false,
        };
      }));
    }
    if (payRes.data) setPayments(payRes.data.map(p => ({
      id: p.id, invoiceId: p.invoice_id, amount: Number(p.amount), method: p.method,
      transactionId: p.transaction_id, lastFour: p.last_four,
      quickbooksId: p.quickbooks_id || null, quickbooksSyncedAt: p.quickbooks_synced_at || null, quickbooksSyncError: p.quickbooks_sync_error || null, notes: p.notes || '', receivedAt: p.received_at,
    })));
    setBillingLoaded(true);
  }, [billingLoaded]);

  // Lazy per-invoice hydrate for the detail modal. loadBilling only fetches
  // the skinny line columns (sale_id, publication_id) — when the user opens
  // an invoice, this runs and swaps the line array for the full records.
  // Idempotent: the guard against re-hydrating reads from the functional
  // setter so this callback stays stable across invoice updates (otherwise
  // Billing.jsx's effect re-fires and re-checks on every data tick).
  const loadInvoiceLines = useCallback(async (invoiceId) => {
    if (!invoiceId || !isOnline()) return;
    let alreadyHydrated = false;
    setInvoices(prev => {
      const current = (prev || []).find(i => i.id === invoiceId);
      if (current?.linesHydrated) alreadyHydrated = true;
      return prev;
    });
    if (alreadyHydrated) return;
    const { data, error } = await supabase
      .from('invoice_lines')
      .select('id, description, sale_id, publication_id, issue_id, quantity, unit_price, total, transaction_type')
      .eq('invoice_id', invoiceId)
      .order('id', { ascending: true });
    if (error) { console.error('loadInvoiceLines error:', error); return; }
    setInvoices(prev => (prev || []).map(inv => inv.id === invoiceId ? {
      ...inv,
      linesHydrated: true,
      lines: (data || []).map(l => ({
        id: l.id,
        description: l.description,
        saleId: l.sale_id,
        publicationId: l.publication_id,
        issueId: l.issue_id,
        quantity: l.quantity,
        unitPrice: Number(l.unit_price),
        total: Number(l.total),
        transactionType: l.transaction_type,
      })),
    } : inv));
  }, []);

  // ── Media assets — lazy loader ─────────────────────────
  const loadMediaAssets = useCallback(async () => {
    if (mediaAssetsLoaded || !isOnline()) return;
    // Paginate to pick up all tagged rows
    const all = [];
    let pg = 0;
    while (true) {
      const { data } = await supabase.from('media_assets')
        .select('*')
        .order('created_at', { ascending: false })
        .range(pg * 1000, (pg + 1) * 1000 - 1);
      if (!data?.length) break;
      all.push(...data);
      if (data.length < 1000) break;
      pg++;
    }
    setMediaAssets(all.map(a => ({
      id: a.id, fileName: a.file_name, mimeType: a.mime_type, fileType: a.file_type,
      fileSize: a.file_size, storagePath: a.storage_path, cdnUrl: a.cdn_url,
      width: a.width, height: a.height, altText: a.alt_text, caption: a.caption,
      category: a.category || 'general', tags: a.tags || [],
      publicationId: a.publication_id, storyId: a.story_id, clientId: a.client_id,
      saleId: a.sale_id, adProjectId: a.ad_project_id, legalNoticeId: a.legal_notice_id,
      uploadedBy: a.uploaded_by, createdAt: a.created_at,
    })));
    setMediaAssetsLoaded(true);
  }, [mediaAssetsLoaded]);

  // Append or update a media_assets row after a direct upload. Callers use
  // uploadMedia() from lib/media.js which writes the DB row — this helper
  // just hydrates local state so the Media Library updates immediately.
  const pushMediaAsset = useCallback((row) => {
    if (!row) return;
    const mapped = {
      id: row.id, fileName: row.file_name, mimeType: row.mime_type, fileType: row.file_type,
      fileSize: row.file_size, storagePath: row.storage_path, cdnUrl: row.cdn_url,
      width: row.width, height: row.height, altText: row.alt_text, caption: row.caption,
      category: row.category || 'general', tags: row.tags || [],
      publicationId: row.publication_id, storyId: row.story_id, clientId: row.client_id,
      saleId: row.sale_id, adProjectId: row.ad_project_id, legalNoticeId: row.legal_notice_id,
      uploadedBy: row.uploaded_by, createdAt: row.created_at,
    };
    setMediaAssets(prev => {
      const idx = prev.findIndex(x => x.id === mapped.id);
      if (idx === -1) return [mapped, ...prev];
      const next = prev.slice();
      next[idx] = mapped;
      return next;
    });
  }, []);

  const removeMediaAsset = useCallback((id) => {
    setMediaAssets(prev => prev.filter(x => x.id !== id));
  }, []);

  // ── Ad proof save + expiration helpers ──────────────────
  const saveAdProof = useCallback(async (proofId, teamMemberId) => {
    if (!isOnline()) return;
    const { data } = await supabase.from('ad_proofs')
      .update({ saved_at: new Date().toISOString(), saved_by: teamMemberId || null })
      .eq('id', proofId)
      .select()
      .single();
    return data;
  }, []);

  // Called on Ad Projects page mount. Deletes any proof that's unsaved and
  // older than 7 days (created_at + 7d < now AND saved_at IS NULL).
  const expireStaleProofs = useCallback(async () => {
    if (!isOnline()) return;
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    await supabase.from('ad_proofs')
      .delete()
      .is('saved_at', null)
      .lt('created_at', cutoff);
  }, []);

  // Kick off billing load in the background as soon as the app mounts.
  // Dashboard's overdue/outstanding KPIs read from `invoices`, so without this
  // those numbers sit at zero until the user first opens Billing/Analytics and
  // then snap up ~10s later when loadBilling finishes. Firing it here means the
  // data is usually ready by the time the user actually clicks anywhere that
  // depends on it. No-op if already loaded.
  useEffect(() => {
    if (!isOnline()) return;
    loadBilling();
  }, [loadBilling]);

  // Bills module (vendor bills / expenses)
  const [billsLoaded, setBillsLoaded] = useState(false);
  const loadBills = useCallback(async () => {
    if (billsLoaded || !isOnline()) return;
    const { data } = await supabase.from('bills').select('*').order('bill_date', { ascending: false }).limit(500);
    if (data) {
      setBills(data.map(b => ({
        id: b.id,
        publicationId: b.publication_id,
        vendorName: b.vendor_name,
        vendorEmail: b.vendor_email,
        category: b.category,
        description: b.description,
        amount: Number(b.amount),
        billDate: b.bill_date,
        dueDate: b.due_date,
        status: b.status,
        paidAt: b.paid_at,
        paidMethod: b.paid_method,
        checkNumber: b.check_number || '',
        ccLastFour: b.cc_last_four || '',
        quickbooksId: b.quickbooks_id,
        quickbooksSyncedAt: b.quickbooks_synced_at,
        quickbooksSyncError: b.quickbooks_sync_error,
        sourceType: b.source_type,
        sourceId: b.source_id,
        attachmentUrl: b.attachment_url || '',
        notes: b.notes,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      })));
    }
    setBillsLoaded(true);
  }, [billsLoaded]);

  const insertBill = useCallback(async (bill) => {
    const row = {
      publication_id: bill.publicationId || null,
      vendor_name: bill.vendorName,
      vendor_email: bill.vendorEmail || '',
      category: bill.category,
      description: bill.description || '',
      amount: Number(bill.amount) || 0,
      bill_date: bill.billDate,
      due_date: bill.dueDate || null,
      status: bill.status || 'pending',
      paid_method: bill.paidMethod || '',
      check_number: bill.checkNumber || '',
      cc_last_four: bill.ccLastFour || '',
      attachment_url: bill.attachmentUrl || '',
      notes: bill.notes || '',
    };
    const { data, error } = await supabase.from('bills').insert(row).select().single();
    if (error) throw error;
    const mapped = {
      id: data.id, publicationId: data.publication_id, vendorName: data.vendor_name,
      vendorEmail: data.vendor_email, category: data.category, description: data.description,
      amount: Number(data.amount), billDate: data.bill_date, dueDate: data.due_date,
      status: data.status, paidAt: data.paid_at, paidMethod: data.paid_method,
      checkNumber: data.check_number || '', ccLastFour: data.cc_last_four || '',
      attachmentUrl: data.attachment_url || '',
      quickbooksId: data.quickbooks_id, quickbooksSyncedAt: data.quickbooks_synced_at,
      notes: data.notes, createdAt: data.created_at,
    };
    setBills(prev => [mapped, ...prev]);
    return mapped;
  }, []);

  const updateBill = useCallback(async (id, changes) => {
    const row = {};
    if (changes.publicationId !== undefined) row.publication_id = changes.publicationId || null;
    if (changes.vendorName !== undefined) row.vendor_name = changes.vendorName;
    if (changes.vendorEmail !== undefined) row.vendor_email = changes.vendorEmail;
    if (changes.category !== undefined) row.category = changes.category;
    if (changes.description !== undefined) row.description = changes.description;
    if (changes.amount !== undefined) row.amount = Number(changes.amount) || 0;
    if (changes.billDate !== undefined) row.bill_date = changes.billDate;
    if (changes.dueDate !== undefined) row.due_date = changes.dueDate || null;
    if (changes.status !== undefined) row.status = changes.status;
    if (changes.paidAt !== undefined) row.paid_at = changes.paidAt;
    if (changes.paidMethod !== undefined) row.paid_method = changes.paidMethod;
    if (changes.checkNumber !== undefined) row.check_number = changes.checkNumber;
    if (changes.ccLastFour !== undefined) row.cc_last_four = changes.ccLastFour;
    if (changes.attachmentUrl !== undefined) row.attachment_url = changes.attachmentUrl;
    if (changes.notes !== undefined) row.notes = changes.notes;
    if (changes.quickbooksId !== undefined) row.quickbooks_id = changes.quickbooksId;
    if (changes.quickbooksSyncedAt !== undefined) row.quickbooks_synced_at = changes.quickbooksSyncedAt;
    if (changes.quickbooksSyncError !== undefined) row.quickbooks_sync_error = changes.quickbooksSyncError;

    const { error } = await supabase.from('bills').update(row).eq('id', id);
    if (error) throw error;
    setBills(prev => prev.map(b => b.id === id ? { ...b, ...changes } : b));
  }, []);

  const deleteBill = useCallback(async (id) => {
    const { error } = await supabase.from('bills').delete().eq('id', id);
    if (error) throw error;
    setBills(prev => prev.filter(b => b.id !== id));
  }, []);

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

  // Editions (editions)
  const [editionsLoaded, setEditionsLoaded] = useState(false);
  const loadEditions = useCallback(async () => {
    if (editionsLoaded || !isOnline()) return;
    const { data } = await supabase.from('editions').select('*').order('publish_date', { ascending: false });
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
    // Inbound inquiries accumulate forever; most screens only care about the
    // last few months of activity. Cap to 500 most recent.
    const { data } = await supabase.from('ad_inquiries').select('*').order('created_at', { ascending: false }).limit(500);
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

  // Ad Projects — design-state overlay keyed by sale_id. Post-migration 027,
  // every row has a non-null sale_id, so callers should look up by sale.
  // Lazy-loaded when Design Studio (or any consumer) first asks.
  const loadAdProjects = useCallback(async () => {
    if (adProjectsLoaded || !isOnline()) return;
    const { data, error } = await supabase
      .from('ad_projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) { console.error('loadAdProjects failed:', error); return; }
    setAdProjects(data || []);
    setAdProjectsLoaded(true);
  }, [adProjectsLoaded]);

  // Map<saleId, adProject> — O(1) design-state lookup for any sale.
  // Post-migration 027, sale_id is unique so this map is 1:1.
  const adProjectBySaleId = useMemo(() => {
    const m = new Map();
    for (const p of adProjects) {
      if (p.sale_id) m.set(p.sale_id, p);
    }
    return m;
  }, [adProjects]);

  // Design state overlay for a given sale. Returns the canonical shape that
  // Design Studio (and any future consumer) reads: either an existing project
  // or a synthetic `needs_brief` placeholder so empty cards render uniformly.
  const getDesignStateForSale = useCallback((saleId) => {
    if (!saleId) return { status: 'needs_brief', project: null };
    const project = adProjectBySaleId.get(saleId) || null;
    if (!project) return { status: 'needs_brief', project: null };
    return { status: project.status, project };
  }, [adProjectBySaleId]);

  // Insert or update the ad_project row for a given sale. Enforces the
  // one-project-per-sale invariant at the call site so callers don't have to
  // care whether a row already exists. Patch uses snake_case DB columns.
  const upsertAdProject = useCallback(async ({ saleId, patch = {} }) => {
    if (!saleId) throw new Error('upsertAdProject requires saleId');
    if (!isOnline()) return null;
    const existing = adProjectBySaleId.get(saleId);
    if (existing) {
      const { data, error } = await supabase
        .from('ad_projects')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) { console.error('upsertAdProject update failed:', error); return null; }
      setAdProjects(prev => prev.map(p => p.id === data.id ? data : p));
      return data;
    }
    // Insert path — we need enough denormalized context on the row that it
    // can render even before the sale is joined in. Pull from the sales list
    // in-memory so the caller only has to supply saleId + patch.
    const sale = (sales || []).find(s => s.id === saleId);
    if (!sale) { console.error('upsertAdProject: sale not found', saleId); return null; }
    // Pull brief fields from the proposal if available
    const proposal = sale.proposalId ? proposals.find(p => p.id === sale.proposalId) : null;
    const row = {
      sale_id: saleId,
      client_id: sale.clientId || sale.client_id,
      publication_id: sale.publication || sale.publicationId || sale.publication_id,
      issue_id: sale.issueId || sale.issue_id,
      ad_size: sale.size || sale.ad_size || null,
      status: 'brief',
      // Campaign brief flows from proposal → ad_project
      brief_headline: proposal?.briefHeadline || proposal?.brief_headline || null,
      brief_style: proposal?.briefStyle || proposal?.brief_style || null,
      brief_colors: proposal?.briefColors || proposal?.brief_colors || null,
      brief_instructions: proposal?.briefInstructions || proposal?.brief_instructions || null,
      source_proposal_id: sale.proposalId || null,
      source_contract_id: sale.contractId || null,
      ...patch,
    };
    const { data, error } = await supabase
      .from('ad_projects')
      .insert(row)
      .select()
      .single();
    if (error) { console.error('upsertAdProject insert failed:', error); return null; }
    setAdProjects(prev => [data, ...prev]);
    return data;
  }, [adProjectBySaleId, sales, proposals]);

  // Link a secondary ad project to a primary — the secondary's status
  // flips to 'linked' and its design workflow is deferred to the primary.
  // Used for shared-content publications where the same physical ad runs
  // in two issues and only needs one design cycle.
  const linkAdProject = useCallback(async (secondaryId, primaryId) => {
    if (!secondaryId || !primaryId || !isOnline()) return null;
    const { data, error } = await supabase
      .from('ad_projects')
      .update({
        linked_to_project_id: primaryId,
        status: 'linked',
        updated_at: new Date().toISOString(),
      })
      .eq('id', secondaryId)
      .select()
      .single();
    if (error) { console.error('linkAdProject failed:', error); return null; }
    setAdProjects(prev => prev.map(p => p.id === data.id ? data : p));
    return data;
  }, []);

  // Unlink a secondary ad project — restores it to 'brief' so it gets
  // its own independent design cycle.
  const unlinkAdProject = useCallback(async (secondaryId) => {
    if (!secondaryId || !isOnline()) return null;
    const { data, error } = await supabase
      .from('ad_projects')
      .update({
        linked_to_project_id: null,
        status: 'brief',
        updated_at: new Date().toISOString(),
      })
      .eq('id', secondaryId)
      .select()
      .single();
    if (error) { console.error('unlinkAdProject failed:', error); return null; }
    setAdProjects(prev => prev.map(p => p.id === data.id ? data : p));
    return data;
  }, []);

  // Find candidate ad projects that could be linked to a given project.
  // Criteria: same client, same ad_size, issue date within ±7 days, in a
  // sibling publication (shared_content_with), not already linked, not self.
  const findLinkCandidates = useCallback((projectId) => {
    const project = adProjects.find(p => p.id === projectId);
    if (!project) return [];
    const pub = (pubs || []).find(p => p.id === project.publication_id);
    const siblings = pub?.sharedContentWith || [];
    if (siblings.length === 0) return [];

    const projectIssue = (issues || []).find(i => i.id === project.issue_id);
    const projectDate = projectIssue?.date;

    return adProjects.filter(p => {
      if (p.id === projectId) return false;
      if (p.status === 'linked') return false;
      if (p.linked_to_project_id) return false;
      if (p.client_id !== project.client_id) return false;
      if (p.ad_size !== project.ad_size) return false;
      if (!siblings.includes(p.publication_id)) return false;
      // Date proximity check (±7 days)
      if (projectDate) {
        const pIssue = (issues || []).find(i => i.id === p.issue_id);
        if (pIssue?.date) {
          const diff = Math.abs(new Date(pIssue.date) - new Date(projectDate));
          if (diff > 7 * 86400000) return false;
        }
      }
      return true;
    });
  }, [adProjects, pubs, issues]);

  // Commissions — loaded when Commissions tab is opened
  const [commissionsLoaded, setCommissionsLoaded] = useState(false);
  const loadCommissions = useCallback(async () => {
    if (commissionsLoaded || !isOnline()) return;
    // Ledger and payouts can grow without bound over years. Clamp to the
    // last 2 years on boot — older periods are available via a "load archive"
    // action (not exposed yet; add when the UI needs it).
    const ledgerCutoff = new Date(Date.now() - 730 * 86400000).toISOString();
    const [ledgerRes, payoutsRes, goalsRes, assignRes, ratesRes] = await Promise.all([
      supabase.from('commission_ledger').select('*').gte('created_at', ledgerCutoff).order('created_at', { ascending: false }).limit(5000),
      supabase.from('commission_payouts').select('*').gte('created_at', ledgerCutoff).order('created_at', { ascending: false }).limit(2000),
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
      commissionTrigger: a.commission_trigger || null,
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
    if (isOnline()) {
      // Keep issues.revenue_goal in sync for legacy readers AND upsert
      // commission_issue_goals so the rebuild trigger fires and the
      // salesperson allocations cascade. Without the commission_issue_goals
      // write, goal edits made via Flatplan or Sales flows would never
      // reach issue_goal_allocations.
      const { data: issueRow } = await supabase
        .from('issues').select('pub_id').eq('id', issueId).single();
      await supabase.from('issues').update({ revenue_goal: goal }).eq('id', issueId);
      if (issueRow?.pub_id) {
        await supabase.from('commission_issue_goals').upsert(
          { issue_id: issueId, publication_id: issueRow.pub_id, goal },
          { onConflict: 'issue_id' }
        );
      }
    }
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
      if (changes.lapsedReason !== undefined) db.lapsed_reason = changes.lapsedReason;
      if (changes.repId !== undefined) db.rep_id = changes.repId;
      if (changes.billingEmail !== undefined) db.billing_email = changes.billingEmail || null;
      if (changes.billingCcEmails !== undefined) db.billing_cc_emails = Array.isArray(changes.billingCcEmails) ? changes.billingCcEmails.filter(Boolean).slice(0, 2) : [];
      if (changes.billingAddress !== undefined) db.billing_address = changes.billingAddress || null;
      if (changes.billingAddress2 !== undefined) db.billing_address2 = changes.billingAddress2 || null;
      if (changes.billingCity !== undefined) db.billing_city = changes.billingCity || null;
      if (changes.billingState !== undefined) db.billing_state = changes.billingState || null;
      if (changes.billingZip !== undefined) db.billing_zip = changes.billingZip || null;
      if (changes.creditHold !== undefined) {
        db.credit_hold = changes.creditHold;
        db.credit_hold_reason = changes.creditHoldReason || null;
        db.credit_hold_set_at = changes.creditHold ? new Date().toISOString() : null;
      }
      if (Object.keys(db).length) await supabase.from('clients').update(db).eq('id', id);
    }
  }, []);

  // Update a single contact row on client_contacts. Used by the per-contact
  // Relationship Notes textarea on the client profile and by any future
  // inline contact edits. Local state mirrors the change so the UI is
  // optimistic; the remote update runs in the background.
  const updateClientContact = useCallback(async (clientId, contactId, changes) => {
    setClients(cl => cl.map(c => c.id === clientId
      ? { ...c, contacts: (c.contacts || []).map(ct => ct.id === contactId ? { ...ct, ...changes } : ct) }
      : c));
    if (isOnline()) {
      const db = {};
      if (changes.name !== undefined) db.name = changes.name;
      if (changes.email !== undefined) db.email = changes.email;
      if (changes.phone !== undefined) db.phone = changes.phone;
      if (changes.role !== undefined) db.role = changes.role;
      if (changes.notes !== undefined) db.notes = changes.notes;
      if (changes.isPrimary !== undefined) db.is_primary = changes.isPrimary;
      if (Object.keys(db).length) await supabase.from('client_contacts').update(db).eq('id', contactId);
    }
  }, []);

  const insertClient = useCallback(async (client) => {
    if (isOnline()) {
      const { data } = await supabase.from('clients').insert({
        name: client.name, status: client.status || 'Lead', total_spend: client.totalSpend || 0,
        category: client.category || '', notes: client.notes || '',
        lead_source: client.leadSource || '', industries: client.industries || [],
        interested_pubs: client.interestedPubs || [],
        rep_id: client.repId || null,
        billing_email: client.billingEmail || null,
        billing_cc_emails: Array.isArray(client.billingCcEmails) ? client.billingCcEmails.filter(Boolean).slice(0, 2) : [],
        billing_address: client.billingAddress || null,
        billing_address2: client.billingAddress2 || null,
        billing_city: client.billingCity || null,
        billing_state: client.billingState || null,
        billing_zip: client.billingZip || null,
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
    // Single-source status model: once editorial is done the story is
    // "Ready". Scheduled vs Live is expressed through sent_to_web +
    // scheduled_at, not through a separate status value.
    const existing = stories.find(s => s.id === id);
    const alreadyPublished = existing?.publishedAt || existing?.published_at;
    const publishedAt = isScheduled ? null : (alreadyPublished || new Date().toISOString());

    const changes = {
      status: 'Ready',
      sent_to_web: !isScheduled,
      slug, body, excerpt: autoExcerpt,
      category, category_slug: categorySlug,
      site_id: siteId, featured_image_url: featuredImageUrl || null,
      seo_title: seoTitle || title, seo_description: seoDescription || autoExcerpt,
      published_at: publishedAt, scheduled_at: scheduledAt || null,
    };

    setStories(st => st.map(s => s.id === id ? { ...s, ...changes, sentToWeb: !isScheduled, sent_to_web: !isScheduled } : s));
    if (isOnline()) {
      await supabase.from('stories').update(changes).eq('id', id);
    }
    return { slug, status: 'Ready', sent_to_web: !isScheduled };
  }, [stories]);

  const unpublishStory = useCallback(async (id) => {
    // Flip sent_to_web off but leave status at Ready — editorial is still
    // done, just not currently on the web.
    setStories(st => st.map(s => s.id === id ? { ...s, status: 'Ready', sentToWeb: false, sent_to_web: false } : s));
    if (isOnline()) {
      await supabase.from('stories').update({ status: 'Ready', sent_to_web: false }).eq('id', id);
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
      if (changes.issueId !== undefined) db.issue_id = changes.issueId;
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
      const { data, error } = await supabase.from('proposals').insert({
        client_id: proposal.clientId, name: proposal.name, term: proposal.term,
        term_months: proposal.termMonths, total: proposal.total, pay_plan: proposal.payPlan,
        monthly: proposal.monthly, status: proposal.status || 'Draft', date: proposal.date,
        renewal_date: proposal.renewalDate || null, sent_to: proposal.sentTo || [],
        assigned_to: proposal.assignedTo || null, discount_pct: proposal.discountPct || 0,
        sent_at: proposal.sentAt || null, art_source: proposal.artSource || null, charge_day: proposal.chargeDay || 1,
        brief_headline: proposal.briefHeadline || null, brief_style: proposal.briefStyle || null, brief_colors: proposal.briefColors || null, brief_instructions: proposal.briefInstructions || null,
      }).select().single();
      if (error) { console.error("insertProposal error:", error); throw new Error(error.message); }
      if (data && proposal.lines?.length) {
        const { error: lineErr } = await supabase.from('proposal_lines').insert(proposal.lines.map((l, i) => ({
          proposal_id: data.id, publication_id: l.pubId, pub_name: l.pubName,
          ad_size: l.adSize, dims: l.dims || '', ad_width: l.adW || 0, ad_height: l.adH || 0,
          issue_id: l.issueId, issue_label: l.issueLabel, issue_date: l.issueDate || null,
          price: l.price, sort_order: i, notes: l.notes || null,
        })));
        if (lineErr) console.error("insertProposal lines error:", lineErr);
        const np = { ...proposal, id: data.id }; setProposals(pr => [...pr, np]); return np;
      }
      if (data) { const np = { ...proposal, id: data.id }; setProposals(pr => [...pr, np]); return np; }
    }
    const np = { ...proposal, id: 'prop' + Date.now() }; setProposals(pr => [...pr, np]); return np;
  }, []);

  // Convert a Sent proposal → Signed & Converted contract + sales orders via database function
  const convertProposal = useCallback(async (proposalId) => {
    if (!isOnline()) return { error: 'Offline — cannot convert' };
    const { data, error } = await supabase.rpc('convert_proposal_to_contract', { p_proposal_id: proposalId });
    if (error) return { error: error.message };
    if (data?.error) return data;
    // Success — reload the affected data into local state
    // Update proposal status locally
    setProposals(pr => pr.map(p => p.id === proposalId ? { ...p, status: 'Signed & Converted', contractId: data.contract_id, convertedAt: new Date().toISOString() } : p));
    // Fetch the new contract + its lines so Closed view has pubs + assignedTo immediately
    if (data.contract_id) {
      const [{ data: newContract }, { data: newLines }] = await Promise.all([
        supabase.from('contracts').select('*').eq('id', data.contract_id).single(),
        supabase.from('contract_lines').select('*').eq('contract_id', data.contract_id),
      ]);
      if (newContract) {
        const mappedLines = (newLines || []).map(cl => ({
          id: cl.id, pubId: cl.publication_id, adSize: cl.ad_size,
          rate: Number(cl.rate), quantity: cl.quantity, lineTotal: Number(cl.line_total),
          sortOrder: cl.sort_order, notes: cl.notes || '',
        }));
        const mapped = {
          id: newContract.id, clientId: newContract.client_id, name: newContract.name, status: newContract.status,
          startDate: newContract.start_date, endDate: newContract.end_date,
          totalValue: Number(newContract.total_value), totalPaid: Number(newContract.total_paid),
          discountPct: Number(newContract.discount_pct), paymentTerms: newContract.payment_terms,
          assignedTo: newContract.assigned_to, notes: newContract.notes || '',
          isSynthetic: newContract.is_synthetic,
          chargeDay: newContract.charge_day || 1,
          monthlyAmount: newContract.monthly_amount ? Number(newContract.monthly_amount) : null,
          lines: mappedLines,
        };
        setContracts(prev => {
          const idx = prev.findIndex(c => c.id === mapped.id);
          if (idx === -1) return [mapped, ...prev];
          const next = prev.slice();
          next[idx] = mapped;
          return next;
        });
        setContractLines(prev => [...prev.filter(cl => cl.contractId !== mapped.id), ...(newLines || []).map(cl => ({ id: cl.id, contractId: cl.contract_id, pubId: cl.publication_id, adSize: cl.ad_size, rate: Number(cl.rate), quantity: cl.quantity, lineTotal: Number(cl.line_total) }))]);
      }
    }
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
      assignedTo: s.assigned_to || null,
    })));

    // Pull down the newly created invoices + lines for this contract and merge
    // into local state. Without this, Billing's "needs invoice" panel flags the
    // new Closed sales because there's no realtime listener on invoices.
    if (data.contract_id) {
      const { data: contractSales } = await supabase.from('sales').select('id').eq('contract_id', data.contract_id);
      const saleIds = (contractSales || []).map(s => s.id);
      if (saleIds.length > 0) {
        const { data: newLines } = await supabase.from('invoice_lines').select('*').in('sale_id', saleIds);
        const invoiceIds = [...new Set((newLines || []).map(l => l.invoice_id).filter(Boolean))];
        if (invoiceIds.length > 0) {
          const [{ data: newInvoices }, { data: allLinesForInvs }] = await Promise.all([
            supabase.from('invoices').select('*').in('id', invoiceIds),
            supabase.from('invoice_lines').select('*').in('invoice_id', invoiceIds),
          ]);
          const linesByInv = {};
          (allLinesForInvs || []).forEach(l => {
            if (!linesByInv[l.invoice_id]) linesByInv[l.invoice_id] = [];
            linesByInv[l.invoice_id].push(l);
          });
          const mapped = (newInvoices || []).map(i => {
            const total = Number(i.total);
            const balance = Number(i.balance_due);
            return {
              id: i.id, invoiceNumber: i.invoice_number, clientId: i.client_id,
              status: i.status, billingSchedule: i.billing_schedule,
              subtotal: Number(i.subtotal),
              taxRate: Number(i.tax_rate || 0), taxAmount: Number(i.tax_amount || 0),
              total, balanceDue: balance, amountPaid: total - balance,
              monthlyAmount: Number(i.monthly_amount || 0), planMonths: i.plan_months,
              issueDate: i.issue_date, dueDate: i.due_date,
              notes: i.notes || '', createdAt: i.created_at,
              repId: i.rep_id || null, contractId: i.contract_id || null,
              chargeError: i.charge_error || null, autoChargeAttempts: i.auto_charge_attempts || 0,
              lines: (linesByInv[i.id] || []).map(l => ({
                id: l.id, description: l.description,
                saleId: l.sale_id, publicationId: l.publication_id, issueId: l.issue_id,
                quantity: l.quantity, unitPrice: Number(l.unit_price), total: Number(l.total),
              })),
            };
          });
          setInvoices(prev => {
            const byId = new Map(prev.map(x => [x.id, x]));
            mapped.forEach(m => byId.set(m.id, m));
            return Array.from(byId.values());
          });
        }
      }
    }

    // Ad projects + message threads are now created inside the RPC
    // Just update client art source locally
    if (data.ad_projects_created > 0) {
      const proposal = proposals.find(p => p.id === proposalId);
      if (proposal) {
        const artSource = proposal.artSource || proposal.art_source || 'we_design';
        setClients(cl => cl.map(c => c.id === proposal.clientId ? { ...c, lastArtSource: artSource } : c));
      }
    }

    return data;
  }, [proposals]);

  const addComm = useCallback(async (clientId, comm) => {
    setClients(cl => cl.map(c => c.id === clientId ? { ...c, comms: [...(c.comms || []), comm] } : c));
    if (isOnline()) await supabase.from('communications').insert({ client_id: clientId, type: comm.type || 'Comment', author_name: comm.author, note: comm.note, date: comm.date });
  }, []);

  const addNotification = useCallback(async (text, route) => {
    const notif = { id: 'n' + Date.now(), text, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), read: false, route };
    setNotifications(n => [notif, ...n]);
    if (isOnline()) await supabase.from('notifications').insert({ title: text, link: route, type: 'system' });
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
      const { data, error } = await supabase.from('invoices').insert({
        invoice_number: inv.invoiceNumber, client_id: inv.clientId,
        status: inv.status || 'draft', billing_schedule: inv.billingSchedule || 'lump_sum',
        subtotal: inv.subtotal,
        tax_rate: inv.taxRate || 0, tax_amount: inv.taxAmount || inv.tax || 0,
        total: inv.total, balance_due: inv.balanceDue ?? inv.total,
        monthly_amount: inv.monthlyAmount || 0, plan_months: inv.planMonths || 0,
        issue_date: inv.issueDate, due_date: inv.dueDate, notes: inv.notes || '',
        rep_id: inv.repId || null, contract_id: inv.contractId || null,
      }).select().single();
      if (error) { console.error('insertInvoice failed:', error); return { ...inv, id: inv.id || 'inv-' + Date.now() }; }
      if (data && inv.lines?.length) {
        await supabase.from('invoice_lines').insert(inv.lines.map((l, i) => {
          // transaction_type is NOT NULL (migration 063) + FK to qbo_account_mapping.
          // Caller passes either transactionType (explicit override) or productType
          // (sale.product_type). Catch-all = other_income — sends to Sales:Other
          // in QBO on push, loudly surfaceable via the sync_error column.
          const txType = l.transactionType
            || (l.productType ? deriveTransactionType(l.productType) : null)
            || 'other_income';
          return {
            invoice_id: data.id, description: l.description,
            sale_id: l.saleId || null,
            publication_id: l.publicationId || null, issue_id: l.issueId || null,
            quantity: l.quantity || 1, unit_price: l.unitPrice, total: l.total, sort_order: i,
            transaction_type: txType,
          };
        }));
      }
      return { ...inv, id: data.id };
    }
    return { ...inv, id: inv.id || 'inv-' + Date.now() };
  }, []);

  const updateInvoice = useCallback(async (id, changes) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
    if (isOnline()) {
      const db = {};
      if (changes.status !== undefined) db.status = changes.status;
      if (changes.balanceDue !== undefined) db.balance_due = changes.balanceDue;
      if (changes.dueDate !== undefined) db.due_date = changes.dueDate;
      if (changes.notes !== undefined) db.notes = changes.notes;
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
      const row = {
        salesperson_id: assign.salespersonId,
        publication_id: assign.publicationId,
        percentage: assign.percentage != null ? assign.percentage : 100,
        is_active: assign.isActive !== false,
      };
      if (assign.commissionTrigger !== undefined) row.commission_trigger = assign.commissionTrigger;
      const { data } = await supabase.from('salesperson_pub_assignments').upsert(row, { onConflict: 'salesperson_id,publication_id' }).select().single();
      if (data) {
        const na = {
          id: data.id, salespersonId: data.salesperson_id, publicationId: data.publication_id,
          percentage: Number(data.percentage), isActive: data.is_active,
          commissionTrigger: data.commission_trigger || null,
        };
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
      // Auto-create a bill so the payout flows to AP and QuickBooks
      const spName = team.find(t => t.id === salespersonId)?.name || 'Salesperson';
      await supabase.from('bills').insert({
        publication_id: null, vendor_name: spName, category: 'commission',
        description: `Commission payout — ${period} (${ledgerIds.length} entries)`,
        amount: totalAmount, bill_date: new Date().toISOString().slice(0, 10),
        due_date: new Date().toISOString().slice(0, 10), status: 'paid',
        paid_at: new Date().toISOString(), paid_method: 'check',
        source_type: 'commission_payout', source_id: payout.id,
      });
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

  // Read-modify-write helper for a single publication's site_settings.shared_content_with.
  // Used for bidirectional sibling sync — when A picks B as a sibling, B needs to
  // show A as a sibling too. Returns the new list (or null on failure).
  const writeSharedContentFor = async (pubId, nextSiblings) => {
    const { data: row } = await supabase.from('publications').select('site_settings').eq('id', pubId).single();
    const merged = { ...(row?.site_settings || {}), shared_content_with: nextSiblings };
    const { error } = await supabase.from('publications').update({ site_settings: merged }).eq('id', pubId);
    if (error) { console.error('writeSharedContentFor error:', pubId, error); return null; }
    return nextSiblings;
  };

  const insertPublication = useCallback(async (pub) => {
    const dbPub = {
      id: pub.id, name: pub.name, color: pub.color || '#4B8BF5', type: pub.type,
      page_count: pub.pageCount || 24, width: pub.width, height: pub.height,
      frequency: pub.frequency, circulation: pub.circ || 0,
      pub_day_of_week: pub.pubDayOfWeek, press_day_pattern: pub.pressDayPattern || '',
      ad_close_offset_days: pub.adCloseOffsetDays || 2, ed_close_offset_days: pub.edCloseOffsetDays || 3,
      press_dates_of_month: pub.pressDatesOfMonth || [],
      has_website: pub.hasWebsite || false, website_url: pub.websiteUrl || '',
    };
    if (Array.isArray(pub.sharedContentWith) && pub.sharedContentWith.length) {
      dbPub.site_settings = { shared_content_with: pub.sharedContentWith };
    }
    if (isOnline()) {
      const { data, error } = await supabase.from('publications').upsert(dbPub).select().single();
      if (error) console.error('insertPublication error:', error);
      if (data) {
        const np = { ...pub, id: data.id, sharedContentWith: pub.sharedContentWith || [] };
        setPubs(ps => [...ps.filter(p => p.id !== data.id), np]);
        // Bidirectional: add this new pub's id to each sibling's list
        if (Array.isArray(pub.sharedContentWith) && pub.sharedContentWith.length) {
          await Promise.all(pub.sharedContentWith.map(async siblingId => {
            const { data: sib } = await supabase.from('publications').select('site_settings').eq('id', siblingId).single();
            const current = sib?.site_settings?.shared_content_with || [];
            if (current.includes(data.id)) return;
            const next = [...current, data.id];
            await writeSharedContentFor(siblingId, next);
            setPubs(ps => ps.map(p => p.id === siblingId ? { ...p, sharedContentWith: next } : p));
          }));
        }
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
      if (changes.hasWebsite !== undefined) db.has_website = changes.hasWebsite;
      if (changes.websiteUrl !== undefined) db.website_url = changes.websiteUrl;
      if (changes.dormant !== undefined) db.dormant = changes.dormant;
      if (Object.keys(db).length) await supabase.from('publications').update(db).eq('id', id);
      // Shared content siblings — stored in site_settings JSONB and mirrored
      // bidirectionally: if A picks B, B gets A added; if A drops B, B loses A.
      // This keeps the relationship symmetric so either publication's edit view
      // shows the link locked in after a refresh.
      if (changes.sharedContentWith !== undefined) {
        const nextSiblings = Array.isArray(changes.sharedContentWith) ? changes.sharedContentWith : [];
        const { data: current } = await supabase.from('publications').select('site_settings').eq('id', id).single();
        const prev = current?.site_settings?.shared_content_with || [];
        const added = nextSiblings.filter(s => !prev.includes(s));
        const removed = prev.filter(s => !nextSiblings.includes(s));
        // Write A's own list
        await writeSharedContentFor(id, nextSiblings);
        // Mirror onto each added/removed sibling
        const touched = [...new Set([...added, ...removed])];
        await Promise.all(touched.map(async siblingId => {
          const { data: sib } = await supabase.from('publications').select('site_settings').eq('id', siblingId).single();
          const curr = sib?.site_settings?.shared_content_with || [];
          const shouldHave = nextSiblings.includes(siblingId);
          const has = curr.includes(id);
          if (shouldHave && !has) {
            const next = [...curr, id];
            await writeSharedContentFor(siblingId, next);
            setPubs(ps => ps.map(p => p.id === siblingId ? { ...p, sharedContentWith: next } : p));
          } else if (!shouldHave && has) {
            const next = curr.filter(x => x !== id);
            await writeSharedContentFor(siblingId, next);
            setPubs(ps => ps.map(p => p.id === siblingId ? { ...p, sharedContentWith: next } : p));
          }
        }));
      }
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
      if (changes.isHidden !== undefined) db.is_hidden = changes.isHidden;
      if (changes.modulePermissions !== undefined) db.module_permissions = changes.modulePermissions;
      if (changes.commissionTrigger !== undefined) db.commission_trigger = changes.commissionTrigger;
      if (changes.commissionDefaultRate !== undefined) db.commission_default_rate = changes.commissionDefaultRate;
      if (changes.commissionPayoutFrequency !== undefined) db.commission_payout_frequency = changes.commissionPayoutFrequency;
      if (changes.alertPreferences !== undefined) db.alert_preferences = changes.alertPreferences;
      if (changes.isFreelance !== undefined) db.is_freelance = changes.isFreelance;
      if (changes.specialty !== undefined) db.specialty = changes.specialty;
      if (changes.rateType !== undefined) db.rate_type = changes.rateType;
      if (changes.rateAmount !== undefined) db.rate_amount = changes.rateAmount;
      if (changes.availability !== undefined) db.availability = changes.availability;
      if (Object.keys(db).length) {
        await supabase.from('team_members').update(db).eq('id', id);
        // Audit log for role/permission changes
        const auditFields = ['role', 'module_permissions', 'assigned_pubs', 'is_active', 'commission_trigger'];
        const changed = Object.keys(db).filter(k => auditFields.includes(k));
        if (changed.length > 0) {
          const member = team.find(m => m.id === id);
          await supabase.from('activity_log').insert({
            type: 'permission_change',
            detail: `${member?.name || 'Team member'}: ${changed.map(k => `${k} updated`).join(', ')}`,
            actor_name: 'System',
          }).then(() => {});
        }
      }
    }
  }, [team]);

  // Soft-delete: hide the member and mark inactive. We never hard-delete because
  // 48 foreign keys reference team_members (commissions, sales attribution, story
  // authorship, etc.) — a hard delete would either fail outright or destroy history.
  const deleteTeamMember = useCallback(async (id) => {
    setTeam(t => t.map(m => m.id === id ? { ...m, isHidden: true, isActive: false } : m));
    if (isOnline()) {
      await supabase.from('team_members').update({ is_hidden: true, is_active: false }).eq('id', id);
    }
  }, []);

  // Lazy loaders for heavy data (loaded on-demand, not on initial page load)
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [allContractsLoaded, setAllContractsLoaded] = useState(false);

  const mapContract = (c, linesByContract) => ({
    id: c.id, clientId: c.client_id, name: c.name, status: c.status,
    startDate: c.start_date, endDate: c.end_date,
    totalValue: Number(c.total_value), totalPaid: Number(c.total_paid),
    discountPct: Number(c.discount_pct), paymentTerms: c.payment_terms,
    assignedTo: c.assigned_to, notes: c.notes || '',
    isSynthetic: c.is_synthetic,
    chargeDay: c.charge_day || 1, monthlyAmount: c.monthly_amount ? Number(c.monthly_amount) : null,
    lines: linesByContract?.[c.id] || [],
  });

  const mapContractLine = (cl) => ({
    id: cl.id, pubId: cl.publication_id, adSize: cl.ad_size,
    rate: Number(cl.rate), quantity: cl.quantity, lineTotal: Number(cl.line_total),
    sortOrder: cl.sort_order, notes: cl.notes || '',
  });

  // Fast load: recent contracts (90 days) + ALL monthly payment plan contracts
  const loadContracts = useCallback(async () => {
    if (contractsLoaded || !isOnline()) return;
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const [{ data: recentContracts }, { data: monthlyContracts }] = await Promise.all([
      supabase.from('contracts').select('*').gte('start_date', cutoff).order('start_date', { ascending: false }).limit(200),
      supabase.from('contracts').select('*').eq('payment_terms', 'monthly').eq('status', 'active'),
    ]);
    // Merge and deduplicate
    const allMap = {};
    (recentContracts || []).forEach(c => { allMap[c.id] = c; });
    (monthlyContracts || []).forEach(c => { allMap[c.id] = c; });
    const merged = Object.values(allMap);
    const mergedIds = merged.map(c => c.id);

    const { data: allLines } = await supabase.from('contract_lines').select('*').in('contract_id', mergedIds);
    if (merged.length) {
      const linesByContract = {};
      (allLines || []).forEach(cl => {
        if (!linesByContract[cl.contract_id]) linesByContract[cl.contract_id] = [];
        linesByContract[cl.contract_id].push(mapContractLine(cl));
      });
      setContracts(merged.map(c => mapContract(c, linesByContract)));
      setContractLines((allLines || []).map(cl => ({ id: cl.id, contractId: cl.contract_id, pubId: cl.publication_id, adSize: cl.ad_size, rate: Number(cl.rate), quantity: cl.quantity, lineTotal: Number(cl.line_total) })));
    }
    setContractsLoaded(true);
  }, [contractsLoaded]);

  // Full load: all contracts — for Contracts page deep research
  const loadAllContracts = useCallback(async () => {
    if (allContractsLoaded || !isOnline()) return;
    const [allContracts, allContractLines] = await Promise.all([
      fetchAllRows('contracts', 'start_date', false),
      fetchAllRows('contract_lines', null),
    ]);
    if (allContracts.length > 0) {
      const linesByContract = {};
      allContractLines.forEach(cl => {
        if (!linesByContract[cl.contract_id]) linesByContract[cl.contract_id] = [];
        linesByContract[cl.contract_id].push(mapContractLine(cl));
      });
      setContracts(allContracts.map(c => mapContract(c, linesByContract)));
      setContractLines(allContractLines.map(cl => ({ id: cl.id, contractId: cl.contract_id, pubId: cl.publication_id, adSize: cl.ad_size, rate: Number(cl.rate), quantity: cl.quantity, lineTotal: Number(cl.line_total) })));
    }
    setAllContractsLoaded(true);
    setContractsLoaded(true);
  }, [allContractsLoaded]);

  // Delete a contract. Nulls the FK references on sales / proposals / ad_projects
  // first (NO ACTION cascade would otherwise block the delete), then deletes the
  // contract row. contract_lines CASCADE automatically.
  const deleteContract = useCallback(async (id) => {
    if (!isOnline()) return;
    await supabase.from('sales').update({ contract_id: null }).eq('contract_id', id);
    await supabase.from('proposals').update({ contract_id: null }).eq('contract_id', id);
    await supabase.from('ad_projects').update({ source_contract_id: null }).eq('source_contract_id', id);
    await supabase.from('contracts').delete().eq('id', id);
    setContracts(prev => prev.filter(c => c.id !== id));
    setContractLines(prev => prev.filter(cl => cl.contractId !== id));
    setSales(prev => prev.map(s => s.contractId === id ? { ...s, contractId: null } : s));
  }, []);

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

  // Active pubs — dormant ones are excluded from all metrics/UI site-wide.
  // The Publications page reads `allPubs` so dormant pubs remain visible/togglable.
  const activePubs = useMemo(() => pubs.filter(p => !p.dormant), [pubs]);

  // ============================================================
  // Context value — memoized to prevent unnecessary re-renders
  // ============================================================
  const value = useMemo(() => ({
    // Original data + setters
    pubs: activePubs, allPubs: pubs, setPubs, issues, setIssues, stories, setStories, clients, setClients,
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
    loadContracts, loadAllContracts, loadAllSales, contractsLoaded, allContractsLoaded, allSalesLoaded, deleteContract,
    loadFullSales, fullSalesLoaded, loadSalesForClient,
    // Lazy loaders for module-specific data
    loadClientDetails, clientDetailsLoaded,
    loadProposals, proposalsLoaded, loadProposalHistory,
    retainInquiriesRealtime,
    loadStories, storiesLoaded,
    loadBilling, billingLoaded, loadInvoiceLines,
    bills, setBills, loadBills, billsLoaded, insertBill, updateBill, deleteBill,
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
    updateClient, updateClientContact, insertClient, deleteClient,
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
    updateTeamMember, deleteTeamMember,
    // Media
    mediaAssets, setMediaAssets, mediaAssetsLoaded, loadMediaAssets,
    pushMediaAsset, removeMediaAsset,
    // Ad proof lifecycle
    saveAdProof, expireStaleProofs,
    // Ad Projects (design-state overlay, keyed by sale_id)
    adProjects, setAdProjects, adProjectsLoaded, loadAdProjects,
    adProjectBySaleId, getDesignStateForSale, upsertAdProject,
    linkAdProject, unlinkAdProject, findLinkCandidates,
  }), [
    // Data arrays (re-render consumers only when actual data changes)
    pubs, activePubs, issues, stories, clients, sales, proposals, team, notifications,
    invoices, payments, subscribers, dropLocations, dropLocationPubs,
    drivers, driverRoutes, routeStops, tickets, ticketComments,
    legalNotices, legalNoticeIssues, creativeJobs, contracts, contractLines, salesSummary,
    commissionLedger, commissionPayouts, commissionGoals, commissionRates, salespersonPubAssignments,
    outreachCampaigns, outreachEntries, myPriorities,
    subscriptions, subscriptionPayments, mailingLists, editions, adInquiries,
    mediaAssets, adProjects, adProjectBySaleId,
    // Loaded flags
    loaded, fullSalesLoaded, clientDetailsLoaded, proposalsLoaded, storiesLoaded,
    billingLoaded, circulationLoaded, ticketsLoaded, legalsLoaded, creativeLoaded,
    commissionsLoaded, outreachLoaded, prioritiesLoaded, contractsLoaded, allSalesLoaded, editionsLoaded, inquiriesLoaded,
    mediaAssetsLoaded, adProjectsLoaded,
    // Callbacks are stable (useCallback) so they won't trigger re-renders
    loadFullSales, loadSalesForClient, loadClientDetails, loadProposals, loadProposalHistory, loadStories, loadBilling,
    retainInquiriesRealtime,
    loadCirculation, loadTickets, loadLegals, loadCreative, loadCommissions,
    loadOutreach, loadPriorities, loadContracts, loadAllSales, loadEditions, loadInquiries,
    loadAdProjects, getDesignStateForSale, upsertAdProject,
    linkAdProject, unlinkAdProject, findLinkCandidates,
  ]);

  return <DataContext.Provider value={value}>{loaded ? children : null}</DataContext.Provider>;
}

export const useAppData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useAppData must be used within DataProvider');
  return ctx;
};
