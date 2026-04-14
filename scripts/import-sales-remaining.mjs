#!/usr/bin/env node
/**
 * import-sales-remaining.mjs — import only the ~1186 rows that were
 * skipped because their publications didn't exist yet.
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

function parseCSV(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (i < text.length) {
      let val = '';
      if (text[i] === '"') {
        i++;
        while (i < text.length) {
          if (text[i] === '"' && text[i + 1] === '"') { val += '"'; i += 2; }
          else if (text[i] === '"') { i++; break; }
          else { val += text[i]; i++; }
        }
      } else {
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') { val += text[i]; i++; }
      }
      row.push(val.trim());
      if (i < text.length && text[i] === ',') { i++; } else break;
    }
    while (i < text.length && (text[i] === '\n' || text[i] === '\r')) i++;
    if (row.length >= 2 && row[0] !== 'Company') rows.push(row);
  }
  return rows;
}

function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }
function parseDate(s) { if (!s) return null; const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : null; }
function billingMonth(s) { if (!s) return null; const p = s.split('/'); return p.length === 3 ? `${p[2]}-${p[0].padStart(2,'0')}` : null; }
function inferProductType(size) {
  const s = (size || '').toLowerCase();
  if (/fictitious|legal notice|summons|name change|petition|probate|abandonment/.test(s)) return 'legal_notice';
  if (/classified|church listing|calendar listing|obituary/.test(s)) return 'classified';
  if (/digital|banner|sidebar|e-mail|social media/.test(s)) return 'web_ad';
  if (/editorial|spotlight|in the know|local goods/.test(s)) return 'sponsored_content';
  return 'display_print';
}

// The 6 pubs that were previously missing
const TARGET_PUBS = new Set([
  'Promos', 'Digital Ad Services', 'Special Feature Tab',
  'Central Coast Journal', 'Hidden Hills Magazine', 'What to Do in Malibu',
]);

async function main() {
  console.log('Importing remaining rows for 6 new publications...\n');

  // Load CSVs, filter to only target pubs
  const dir = join(ROOT, 'FullSales-2');
  const files = ['Sheet 1-FullSales.csv','Sheet 2-Table 1.csv','Sheet 3-Table 1.csv','Sheet 4-Table 1.csv','Sheet 5-Table 1.csv'];
  let allRows = [];
  for (const f of files) allRows.push(...parseCSV(readFileSync(join(dir, f), 'utf-8')));
  const rows = allRows.filter(r => TARGET_PUBS.has(r[1]?.trim()));
  console.log(`${rows.length} rows for target pubs\n`);

  // Load mappings
  const { data: dbPubs } = await sb.from('publications').select('id, name');
  const pubByName = {};
  for (const p of (dbPubs || [])) pubByName[p.name] = p.id;

  const { data: allTeam } = await sb.from('team_members').select('id, name');
  const teamByName = {};
  for (const t of (allTeam || [])) teamByName[t.name] = t.id;

  const clientByName = {};
  let page = 0;
  while (true) {
    const { data } = await sb.from('clients').select('id, name').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data?.length) break;
    for (const c of data) clientByName[c.name] = c.id;
    if (data.length < 1000) break;
    page++;
  }

  // Issues
  const issueSet = new Map();
  for (const r of rows) {
    const pid = pubByName[r[1]?.trim()];
    if (!pid) continue;
    const label = r[3]?.trim(), year = r[4]?.trim(), date = parseDate(r[6]);
    if (!label || !year) continue;
    const key = `${pid}__${label}__${year}`;
    if (!issueSet.has(key)) issueSet.set(key, { id: key, pub_id: pid, label: `${label} ${year}`, date, page_count: 24, status: 'published' });
  }
  console.log(`${issueSet.size} issues to create`);
  let issuesOk = 0;
  for (const batch of chunk([...issueSet.values()], 100)) {
    const { error } = await sb.from('issues').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
    if (!error) issuesOk += batch.length;
    else console.error('issue err:', error.message?.slice(0,100));
  }
  console.log(`✓ ${issuesOk} issues\n`);

  // Sales
  const salesRows = [];
  const invoiceGroups = {};
  let skipped = 0;

  for (const r of rows) {
    const cid = clientByName[r[0]?.trim()];
    const pid = pubByName[r[1]?.trim()];
    if (!cid || !pid) { skipped++; continue; }
    const issueLabel = r[3]?.trim(), year = r[4]?.trim(), size = r[5]?.trim();
    const saleId = r[7]?.trim(), invoiceAmt = parseFloat(r[8]) || 0, invoiceDateRaw = r[9]?.trim(), rep = r[10]?.trim();
    const issueKey = issueSet.has(`${pid}__${issueLabel}__${year}`) ? `${pid}__${issueLabel}__${year}` : null;

    salesRows.push({
      client_id: cid, publication_id: pid, issue_id: issueKey,
      ad_size: size || null, amount: invoiceAmt, status: 'Closed',
      product_type: inferProductType(size), assigned_to: teamByName[rep] || null,
      date: parseDate(r[6]), notes: JSON.stringify({ legacy_sale_id: saleId }),
    });

    const bm = billingMonth(invoiceDateRaw);
    if (bm) {
      const gk = `${cid}__${bm}`;
      if (!invoiceGroups[gk]) invoiceGroups[gk] = { client_id: cid, month: bm, invoice_date: `${bm}-01`, saleIndices: [] };
      invoiceGroups[gk].saleIndices.push(salesRows.length - 1);
    }
  }
  console.log(`Skipped: ${skipped}, inserting ${salesRows.length} sales`);

  const allSaleIds = new Array(salesRows.length).fill(null);
  let salesTotal = 0, idx = 0;
  for (const batch of chunk(salesRows, 500)) {
    const { data, error } = await sb.from('sales').insert(batch).select('id');
    if (!error && data) { for (let j = 0; j < data.length; j++) allSaleIds[idx + j] = data[j].id; salesTotal += batch.length; }
    else console.error('sales err:', error?.message?.slice(0,120));
    idx += batch.length;
  }
  console.log(`✓ ${salesTotal} sales\n`);

  // Invoices — need to merge with existing HIST invoices for same client+month
  const groupKeys = Object.keys(invoiceGroups);
  console.log(`${groupKeys.length} invoice groups`);

  // Check which HIST invoices already exist for these groups
  const existingInvMap = {};
  for (const gkBatch of chunk(groupKeys, 100)) {
    const invNumbers = gkBatch.map(k => { const g = invoiceGroups[k]; return `HIST-${g.month}-${g.client_id.slice(0,8)}`; });
    const { data } = await sb.from('invoices').select('id, invoice_number, total, balance_due').in('invoice_number', invNumbers);
    for (const inv of (data || [])) existingInvMap[inv.invoice_number] = inv;
  }

  let invoicesCreated = 0, invoicesUpdated = 0, linesCreated = 0;

  for (const gkBatch of chunk(groupKeys, 50)) {
    for (const key of gkBatch) {
      const g = invoiceGroups[key];
      const invNum = `HIST-${g.month}-${g.client_id.slice(0,8)}`;
      const subtotal = g.saleIndices.reduce((s, si) => s + (salesRows[si]?.amount || 0), 0);
      const rounded = Math.round(subtotal * 100) / 100;

      let invId;
      const existing = existingInvMap[invNum];
      if (existing) {
        // Update existing invoice totals
        const newTotal = Math.round((existing.total + rounded) * 100) / 100;
        await sb.from('invoices').update({ subtotal: newTotal, total: newTotal, balance_due: newTotal }).eq('id', existing.id);
        invId = existing.id;
        invoicesUpdated++;
      } else {
        const { data: inv } = await sb.from('invoices').insert({
          client_id: g.client_id, invoice_number: invNum, status: 'sent',
          billing_schedule: 'per_issue', subtotal: rounded, tax_rate: 0, tax_amount: 0,
          total: rounded, balance_due: rounded, issue_date: g.invoice_date, due_date: g.invoice_date,
        }).select('id');
        invId = inv?.[0]?.id;
        invoicesCreated++;
      }

      if (!invId) continue;
      const lines = g.saleIndices.map((si, j) => ({
        invoice_id: invId, sale_id: allSaleIds[si] || undefined,
        publication_id: salesRows[si].publication_id,
        issue_id: salesRows[si].issue_id || undefined,
        description: salesRows[si].ad_size || 'Ad',
        quantity: 1, unit_price: salesRows[si].amount, total: salesRows[si].amount, sort_order: j + 1,
      }));
      const { error: le } = await sb.from('invoice_lines').insert(lines);
      if (!le) linesCreated += lines.length;
      else {
        // strip issue_id and retry
        const { error: le2 } = await sb.from('invoice_lines').insert(lines.map(l => { const { issue_id, ...r } = l; return r; }));
        if (!le2) linesCreated += lines.length;
        else console.error('lines err:', le2.message?.slice(0,100));
      }
    }
  }

  console.log(`✓ ${invoicesCreated} new invoices, ${invoicesUpdated} updated`);
  console.log(`✓ ${linesCreated} invoice lines`);
  console.log('\nDone!');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
