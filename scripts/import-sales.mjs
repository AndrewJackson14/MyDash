#!/usr/bin/env node
/**
 * import-sales.mjs  —  v3 (correct pub IDs from live DB)
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

// ── CSV ───────────────────────────────────────────────────
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
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          val += text[i]; i++;
        }
      }
      row.push(val.trim());
      if (i < text.length && text[i] === ',') { i++; } else break;
    }
    while (i < text.length && (text[i] === '\n' || text[i] === '\r')) i++;
    if (row.length >= 2 && row[0] !== 'Company') rows.push(row);
  }
  return rows;
}

function loadAllCSVs() {
  const dir = join(ROOT, 'FullSales-2');
  const files = [
    'Sheet 1-FullSales.csv', 'Sheet 2-Table 1.csv', 'Sheet 3-Table 1.csv',
    'Sheet 4-Table 1.csv', 'Sheet 5-Table 1.csv',
  ];
  const all = [];
  for (const f of files) {
    const rows = parseCSV(readFileSync(join(dir, f), 'utf-8'));
    console.log(`  ${f}: ${rows.length} rows`);
    all.push(...rows);
  }
  return all;
}

// ── Helpers ──────────────────────────────────────────────
function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }

function parseDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : null;
}

function billingMonth(s) {
  if (!s) return null;
  const p = s.split('/');
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2,'0')}` : null;
}

function inferProductType(size) {
  const s = (size || '').toLowerCase();
  if (/fictitious|legal notice|summons|name change|petition|probate|abandonment/.test(s)) return 'legal_notice';
  if (/classified|church listing|calendar listing|obituary/.test(s)) return 'classified';
  if (/digital|banner|sidebar|e-mail|social media/.test(s)) return 'web_ad';
  if (/editorial|spotlight|in the know|local goods/.test(s)) return 'sponsored_content';
  return 'display_print';
}

// ══════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   MyDash Sales Import  v3                ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Parse
  console.log('1. Loading CSVs...');
  const rows = loadAllCSVs();
  console.log(`   Total: ${rows.length}\n`);

  // 2. Build pub map from LIVE DB
  console.log('2. Publications...');
  const { data: dbPubs } = await sb.from('publications').select('id, name');
  const pubByName = {};
  for (const p of (dbPubs || [])) pubByName[p.name] = p.id;
  // Handle CSV name variants that differ from DB names
  pubByName['Paso Robles Press'] = pubByName['Paso Robles Press'] || pubByName['The Paso Robles Press'];
  pubByName['Atascadero News'] = pubByName['Atascadero News'] || pubByName['The Atascadero News'];
  // Special Project Magazine vs Special Projects
  if (!pubByName['Special Project Magazine'] && pubByName['Special Projects'])
    pubByName['Special Project Magazine'] = pubByName['Special Projects'];

  console.log(`  ${Object.keys(pubByName).length} pubs mapped`);
  // Check for unmapped pubs in CSV
  const csvPubs = new Set(rows.map(r => r[1]?.trim()));
  const unmapped = [...csvPubs].filter(p => !pubByName[p]);
  if (unmapped.length) console.log(`  Unmapped pubs: ${unmapped.join(', ')}`);

  // 3. Team members
  console.log('\n3. Team members...');
  const { data: allTeam } = await sb.from('team_members').select('id, name');
  const teamByName = {};
  for (const t of (allTeam || [])) teamByName[t.name] = t.id;
  console.log(`  ✓ ${Object.keys(teamByName).length} mapped`);

  // 4. Clients
  console.log('\n4. Clients...');
  const clientByName = {};
  let page = 0;
  while (true) {
    const { data } = await sb.from('clients').select('id, name').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data?.length) break;
    for (const c of data) clientByName[c.name] = c.id;
    if (data.length < 1000) break;
    page++;
  }
  console.log(`  ✓ ${Object.keys(clientByName).length} mapped`);

  // 5. Issues
  console.log('\n5. Issues...');
  const issueSet = new Map();
  for (const r of rows) {
    const pid = pubByName[r[1]?.trim()];
    if (!pid) continue;
    const label = r[3]?.trim();
    const year = r[4]?.trim();
    const date = parseDate(r[6]);
    if (!label || !year) continue;
    const key = `${pid}__${label}__${year}`;
    if (!issueSet.has(key)) {
      const pubType = (dbPubs || []).find(p => p.id === pid);
      issueSet.set(key, {
        id: key,
        pub_id: pid,
        label: `${label} ${year}`,
        date,
        page_count: 24, // safe default
        status: 'published',
      });
    }
  }
  console.log(`  ${issueSet.size} unique issues to upsert`);

  const issueRows = [...issueSet.values()];
  let issuesOk = 0;
  for (const batch of chunk(issueRows, 100)) {
    const { error } = await sb.from('issues').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
    if (error) {
      // try one-by-one
      for (const iss of batch) {
        const { error: e2 } = await sb.from('issues').upsert(iss, { onConflict: 'id', ignoreDuplicates: true });
        if (!e2) issuesOk++;
      }
    } else issuesOk += batch.length;
  }
  console.log(`  ✓ ${issuesOk} issues upserted`);

  // 6. Sales
  console.log('\n6. Sales...');
  const salesRows = [];
  const invoiceGroups = {};
  let skipped = 0;

  for (const r of rows) {
    const clientName = r[0]?.trim();
    const pubName = r[1]?.trim();
    const issueLabel = r[3]?.trim();
    const year = r[4]?.trim();
    const size = r[5]?.trim();
    const saleId = r[7]?.trim();
    const invoiceAmt = parseFloat(r[8]) || 0;
    const invoiceDateRaw = r[9]?.trim();
    const rep = r[10]?.trim();

    const cid = clientByName[clientName];
    const pid = pubByName[pubName];
    if (!cid || !pid) { skipped++; continue; }

    const issueKey = issueSet.has(`${pid}__${issueLabel}__${year}`) ? `${pid}__${issueLabel}__${year}` : null;
    const repId = teamByName[rep] || null;
    const invDate = parseDate(r[6]);

    salesRows.push({
      client_id: cid,
      publication_id: pid,
      issue_id: issueKey,
      ad_size: size || null,
      amount: invoiceAmt,
      status: 'Closed',
      product_type: inferProductType(size),
      assigned_to: repId,
      date: invDate,
      notes: JSON.stringify({ legacy_sale_id: saleId }),
    });

    const bm = billingMonth(invoiceDateRaw);
    if (bm) {
      const gk = `${cid}__${bm}`;
      if (!invoiceGroups[gk]) {
        invoiceGroups[gk] = {
          client_id: cid,
          month: bm,
          invoice_date: `${bm}-01`,
          saleIndices: [],
        };
      }
      invoiceGroups[gk].saleIndices.push(salesRows.length - 1);
    }
  }
  console.log(`  Skipped: ${skipped}`);
  console.log(`  ${salesRows.length} sales to insert`);

  const allSaleIds = new Array(salesRows.length).fill(null);
  let salesTotal = 0;
  let idx = 0;
  for (const batch of chunk(salesRows, 500)) {
    const { data, error } = await sb.from('sales').insert(batch).select('id');
    if (error) {
      for (const small of chunk(batch, 25)) {
        const { data: d2, error: e2 } = await sb.from('sales').insert(small).select('id');
        if (!e2 && d2) {
          for (let j = 0; j < d2.length; j++) allSaleIds[idx + j] = d2[j].id;
          salesTotal += small.length;
        } else if (e2) console.error(`  sales err: ${e2.message?.slice(0,120)}`);
        idx += small.length;
      }
    } else {
      for (let j = 0; j < (data || []).length; j++) allSaleIds[idx + j] = data[j].id;
      salesTotal += batch.length;
      idx += batch.length;
    }
    if (salesTotal % 5000 < 500) process.stdout.write(`  ${salesTotal}/${salesRows.length}...\r`);
  }
  console.log(`  ✓ ${salesTotal} sales inserted                `);

  // 7. Invoices
  console.log('\n7. Invoices...');
  const groupKeys = Object.keys(invoiceGroups);
  console.log(`  ${groupKeys.length} client-month groups`);

  let invoicesCreated = 0;
  let linesCreated = 0;

  for (const gkBatch of chunk(groupKeys, 50)) {
    const invPayload = gkBatch.map(key => {
      const g = invoiceGroups[key];
      const subtotal = g.saleIndices.reduce((s, si) => s + (salesRows[si]?.amount || 0), 0);
      const rounded = Math.round(subtotal * 100) / 100;
      return {
        client_id: g.client_id,
        invoice_number: `HIST-${g.month}-${g.client_id.slice(0, 8)}`,
        status: 'sent',
        billing_schedule: 'per_issue',
        subtotal: rounded,
        tax_rate: 0,
        tax_amount: 0,
        total: rounded,
        balance_due: rounded,
        issue_date: g.invoice_date,
        due_date: g.invoice_date,
      };
    });

    const { data: invs, error: invErr } = await sb.from('invoices').insert(invPayload).select('id');
    if (invErr) {
      console.error(`  inv err: ${invErr.message?.slice(0,150)}`);
      continue;
    }
    invoicesCreated += invs.length;

    // Build invoice_lines — only include pub/issue if they're valid FKs
    const allLines = [];
    for (let i = 0; i < gkBatch.length; i++) {
      const inv = invs[i];
      if (!inv) continue;
      const g = invoiceGroups[gkBatch[i]];
      for (let j = 0; j < g.saleIndices.length; j++) {
        const si = g.saleIndices[j];
        const sale = salesRows[si];
        const saleDbId = allSaleIds[si];
        const line = {
          invoice_id: inv.id,
          description: `${sale.ad_size || 'Ad'}`,
          quantity: 1,
          unit_price: sale.amount,
          total: sale.amount,
          sort_order: j + 1,
        };
        if (saleDbId) line.sale_id = saleDbId;
        if (sale.publication_id) line.publication_id = sale.publication_id;
        if (sale.issue_id) line.issue_id = sale.issue_id;
        allLines.push(line);
      }
    }

    if (allLines.length) {
      for (const lb of chunk(allLines, 500)) {
        const { error: le } = await sb.from('invoice_lines').insert(lb);
        if (le) {
          // Retry without issue_id (might have bad FK)
          const stripped = lb.map(l => { const { issue_id, ...rest } = l; return rest; });
          const { error: le2 } = await sb.from('invoice_lines').insert(stripped);
          if (le2) {
            // Retry without pub_id too
            const bare = stripped.map(l => { const { publication_id, ...rest } = l; return rest; });
            const { error: le3 } = await sb.from('invoice_lines').insert(bare);
            if (!le3) linesCreated += bare.length;
            else console.error(`  lines err: ${le3.message?.slice(0,100)}`);
          } else linesCreated += stripped.length;
        } else linesCreated += lb.length;
      }
    }

    if (invoicesCreated % 500 < 50) process.stdout.write(`  ${invoicesCreated} invoices...\r`);
  }

  console.log(`  ✓ ${invoicesCreated} invoices                    `);
  console.log(`  ✓ ${linesCreated} invoice lines`);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   IMPORT COMPLETE                        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║ CSV rows:          ${rows.length.toString().padStart(8)}            ║`);
  console.log(`║ Clients:           ${Object.keys(clientByName).length.toString().padStart(8)}            ║`);
  console.log(`║ Issues:            ${issuesOk.toString().padStart(8)}            ║`);
  console.log(`║ Sales:             ${salesTotal.toString().padStart(8)}            ║`);
  console.log(`║ Invoices:          ${invoicesCreated.toString().padStart(8)}            ║`);
  console.log(`║ Invoice lines:     ${linesCreated.toString().padStart(8)}            ║`);
  console.log('╚══════════════════════════════════════════╝');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
