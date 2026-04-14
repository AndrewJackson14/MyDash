#!/usr/bin/env node
/**
 * apply-aging.mjs
 * ───────────────
 * Reads the two aging CSVs, matches customers to DB clients,
 * and marks invoices as paid (oldest-first) until the remaining
 * balance matches the aging report total.
 *
 * Logic:
 *   - Clients NOT in aging report → all invoices fully paid
 *   - Clients with Total ≤ 0 → all invoices paid (credit on account)
 *   - Clients with Total > 0 → mark oldest invoices paid until
 *     remaining unpaid invoice totals = aging total
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const sb = createClient(
  'https://hqywacyhpllapdwccmaw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxeXdhY3locGxsYXBkd2NjbWF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY3MjA2MSwiZXhwIjoyMDkwMjQ4MDYxfQ.M2S75H9EpA0jZRw9unbfz2OhibAWPAB0hHHJsZCtC0w'
);

// ── Parse aging CSV ──────────────────────────────────────
function parseAgingCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const results = {};
  for (const line of lines) {
    // Skip header
    if (line.includes('"Customer"')) continue;
    // Parse quoted CSV
    const fields = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        i++;
        let val = '';
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { val += line[i]; i++; }
        }
        fields.push(val);
      } else if (line[i] === ',') {
        i++;
        continue;
      } else {
        let val = '';
        while (i < line.length && line[i] !== ',') { val += line[i]; i++; }
        fields.push(val);
        i++;
        continue;
      }
      if (line[i] === ',') i++;
    }
    if (fields.length < 10) continue;

    // Extract company name (strip contact in parens)
    const fullName = fields[0];
    const match = fullName.match(/^(.+?)\s*\(/);
    const companyName = match ? match[1].trim() : fullName.trim();

    const current = parseFloat(fields[1]) || 0;
    const d1_30 = parseFloat(fields[2]) || 0;
    const d31_60 = parseFloat(fields[3]) || 0;
    const d61_90 = parseFloat(fields[4]) || 0;
    const d91_120 = parseFloat(fields[5]) || 0;
    const d120plus = parseFloat(fields[6]) || 0;
    const subTotal = parseFloat(fields[7]) || 0;
    const prepay = parseFloat(fields[8]) || 0;
    const total = parseFloat(fields[9]) || 0;

    // If client appears in both reports, sum them
    if (results[companyName]) {
      results[companyName].subTotal += subTotal;
      results[companyName].prepay += prepay;
      results[companyName].total += total;
    } else {
      results[companyName] = { companyName, subTotal, prepay, total };
    }
  }
  return results;
}

function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Apply Aging / Close Paid Invoices      ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Parse aging reports
  console.log('1. Parsing aging reports...');
  const aging1 = readFileSync(join(ROOT, 'FullSales-2', 'Aging_04122026_213308.csv'), 'utf-8');
  const aging2 = readFileSync(join(ROOT, 'FullSales-2', 'Aging_04122026_213324.csv'), 'utf-8');
  const agingData = parseAgingCSV(aging1);
  // Merge second report
  const aging2Data = parseAgingCSV(aging2);
  for (const [name, data] of Object.entries(aging2Data)) {
    if (agingData[name]) {
      agingData[name].subTotal += data.subTotal;
      agingData[name].prepay += data.prepay;
      agingData[name].total += data.total;
    } else {
      agingData[name] = data;
    }
  }
  const agingClients = Object.keys(agingData);
  console.log(`  ${agingClients.length} clients in aging report`);

  const withBalance = agingClients.filter(n => agingData[n].total > 0);
  const withCredit = agingClients.filter(n => agingData[n].total <= 0);
  console.log(`  ${withBalance.length} with outstanding balance`);
  console.log(`  ${withCredit.length} with zero/credit balance (fully paid or overpaid)\n`);

  // 2. Load all clients from DB
  console.log('2. Loading clients...');
  const clientByName = {};
  const clientById = {};
  let page = 0;
  while (true) {
    const { data } = await sb.from('clients').select('id, name').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data?.length) break;
    for (const c of data) { clientByName[c.name] = c.id; clientById[c.id] = c.name; }
    if (data.length < 1000) break;
    page++;
  }
  console.log(`  ${Object.keys(clientByName).length} clients in DB`);

  // Match aging names to DB names
  const matched = {};
  const unmatched = [];
  for (const name of agingClients) {
    if (clientByName[name]) {
      matched[name] = clientByName[name];
    } else {
      // Try fuzzy: check if any DB client name starts with the aging name
      const found = Object.keys(clientByName).find(dbName =>
        dbName.toLowerCase() === name.toLowerCase() ||
        dbName.toLowerCase().startsWith(name.toLowerCase())
      );
      if (found) {
        matched[name] = clientByName[found];
      } else {
        unmatched.push(name);
      }
    }
  }
  console.log(`  Matched: ${Object.keys(matched).length}`);
  if (unmatched.length) console.log(`  Unmatched: ${unmatched.join(', ')}`);

  // Build set of client IDs that have outstanding balance
  const clientsWithBalance = new Set();
  for (const name of withBalance) {
    if (matched[name]) clientsWithBalance.add(matched[name]);
  }

  // 3. Load all HIST invoices
  console.log('\n3. Loading invoices...');
  const allInvoices = [];
  let invPage = 0;
  while (true) {
    const { data } = await sb.from('invoices')
      .select('id, client_id, invoice_number, total, balance_due, status, issue_date')
      .like('invoice_number', 'HIST-%')
      .order('issue_date', { ascending: true })
      .range(invPage * 1000, (invPage + 1) * 1000 - 1);
    if (!data?.length) break;
    allInvoices.push(...data);
    if (data.length < 1000) break;
    invPage++;
  }
  console.log(`  ${allInvoices.length} HIST invoices loaded`);

  // Group invoices by client
  const invByClient = {};
  for (const inv of allInvoices) {
    if (!invByClient[inv.client_id]) invByClient[inv.client_id] = [];
    invByClient[inv.client_id].push(inv);
  }
  // Sort each client's invoices by date (oldest first)
  for (const cid of Object.keys(invByClient)) {
    invByClient[cid].sort((a, b) => (a.issue_date || '').localeCompare(b.issue_date || ''));
  }

  const allClientIds = new Set(Object.keys(invByClient));
  console.log(`  ${allClientIds.size} clients with invoices`);

  // 4. Process payments
  console.log('\n4. Processing...');
  let paidInFull = 0;        // invoices marked paid
  let partiallyPaid = 0;     // invoices with partial payment
  let leftUnpaid = 0;        // invoices left as-is (still owed)
  let clientsFullyPaid = 0;  // clients with no balance

  const updates = []; // { id, status, balance_due }

  for (const clientId of allClientIds) {
    const invoices = invByClient[clientId];
    const clientName = clientById[clientId];

    // Check if this client is in the aging report with a balance
    let agingEntry = null;
    for (const [agName, agData] of Object.entries(agingData)) {
      if (matched[agName] === clientId) { agingEntry = agData; break; }
    }

    if (!agingEntry || agingEntry.total <= 0) {
      // Client not in aging or has credit → ALL invoices are paid
      for (const inv of invoices) {
        updates.push({ id: inv.id, status: 'paid', balance_due: 0 });
        paidInFull++;
      }
      clientsFullyPaid++;
      continue;
    }

    // Client has outstanding balance
    // Total invoiced for this client
    const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
    const totalOwed = Math.round(agingEntry.total * 100) / 100;
    const totalPaid = Math.round((totalInvoiced - totalOwed) * 100) / 100;

    if (totalPaid <= 0) {
      // Nothing paid - leave all as sent
      leftUnpaid += invoices.length;
      continue;
    }

    // Mark invoices as paid from oldest until we've consumed the paid amount
    let remaining = totalPaid;
    for (const inv of invoices) {
      if (remaining <= 0) {
        // This invoice and all newer ones are unpaid
        leftUnpaid++;
        continue;
      }
      if (remaining >= inv.total) {
        // Fully paid
        updates.push({ id: inv.id, status: 'paid', balance_due: 0 });
        remaining -= inv.total;
        paidInFull++;
      } else {
        // Partially paid
        const bal = Math.round((inv.total - remaining) * 100) / 100;
        updates.push({ id: inv.id, status: 'partially_paid', balance_due: bal });
        remaining = 0;
        partiallyPaid++;
      }
    }
  }

  console.log(`  Clients fully paid: ${clientsFullyPaid}`);
  console.log(`  Invoices to mark paid: ${paidInFull}`);
  console.log(`  Invoices partially paid: ${partiallyPaid}`);
  console.log(`  Invoices still unpaid: ${leftUnpaid}`);
  console.log(`  Total updates to apply: ${updates.length}\n`);

  // 5. Apply updates in batches
  console.log('5. Applying updates...');
  let applied = 0;
  for (const batch of chunk(updates, 100)) {
    for (const u of batch) {
      const { error } = await sb.from('invoices')
        .update({ status: u.status, balance_due: u.balance_due })
        .eq('id', u.id);
      if (error) console.error(`  err ${u.id}: ${error.message?.slice(0,80)}`);
      else applied++;
    }
    if (applied % 1000 < 100) process.stdout.write(`  ${applied}/${updates.length}...\r`);
  }
  console.log(`  ✓ ${applied} invoices updated                 `);

  // 6. Mark overdue invoices
  console.log('\n6. Marking overdue invoices...');
  const cutoff = '2026-03-12'; // ~30 days before today (Apr 12)
  const { count: overdue, error: odErr } = await sb.from('invoices')
    .update({ status: 'overdue' })
    .eq('status', 'sent')
    .lt('due_date', cutoff)
    .select('id', { count: 'exact', head: true });
  console.log(odErr ? `  Error: ${odErr.message}` : `  ✓ ${overdue} invoices marked overdue`);

  // Final summary
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   AR RECONCILIATION COMPLETE             ║');
  console.log('╠══════════════════════════════════════════╣');

  // Count final statuses
  const statuses = {};
  for (const status of ['paid', 'partially_paid', 'sent', 'overdue']) {
    const { count } = await sb.from('invoices').select('id', { count: 'exact', head: true })
      .eq('status', status).like('invoice_number', 'HIST-%');
    statuses[status] = count;
  }
  console.log(`║ Paid:              ${(statuses.paid || 0).toString().padStart(8)}            ║`);
  console.log(`║ Partially paid:    ${(statuses.partially_paid || 0).toString().padStart(8)}            ║`);
  console.log(`║ Sent (current):    ${(statuses.sent || 0).toString().padStart(8)}            ║`);
  console.log(`║ Overdue:           ${(statuses.overdue || 0).toString().padStart(8)}            ║`);
  console.log('╚══════════════════════════════════════════╝');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
