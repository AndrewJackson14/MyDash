/**
 * QBO Account Mapping Resolver
 *
 * Translates a MyDash transaction_type + context tokens into:
 *   { qbo_account_name, line_description, category }
 *
 * This is the STRUCTURED half of the belt-and-suspenders pattern. The push
 * layer (BillsTab.jsx, Billing.jsx) then calls the QBO `query` endpoint to
 * fetch the live Account.Id case-insensitively matching qbo_account_name.
 * The live QBO query is NEVER cached across pushes — a fresh query every time.
 *
 * Caching (in-memory, 5 min):
 *   Only the qbo_account_mapping TABLE is cached. Changes to the mapping
 *   table via Supabase Studio take up to 5 min to propagate unless
 *   invalidateMappingCache() is called explicitly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  QboAccountMapping,
  TokenValues,
  ResolvedQboLine,
  UnknownTransactionTypeError,
  MissingTokenError,
} from './qboMappingTypes';

// ----------------------------------------------------------------------------
// Mapping cache (NOT the QBO account-list cache — that lives in the push flow
// and must be refreshed on every push)
// ----------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  byType: Map<string, QboAccountMapping>;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

/** Clear the mapping cache. Call after admin updates to qbo_account_mapping. */
export function invalidateMappingCache(): void {
  cache = null;
}

async function loadMappings(
  supabase: SupabaseClient,
): Promise<Map<string, QboAccountMapping>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.byType;
  }

  const { data, error } = await supabase
    .from('qbo_account_mapping')
    .select('*')
    .eq('active', true);

  if (error) {
    throw new Error(`Failed to load QBO account mappings: ${error.message}`);
  }

  const byType = new Map<string, QboAccountMapping>();
  for (const row of data ?? []) {
    byType.set(row.transaction_type, row as QboAccountMapping);
  }

  cache = { byType, expiresAt: now + CACHE_TTL_MS };
  return byType;
}

// ----------------------------------------------------------------------------
// Template rendering
// ----------------------------------------------------------------------------
const TOKEN_PATTERN = /\{([a-z_][a-z0-9_]*)\}/g;

export function renderTemplate(
  template: string,
  requiredTokens: string[],
  values: TokenValues,
  transactionType: string,
): string {
  const missing = requiredTokens.filter(
    (t) => values[t] === undefined || values[t] === null || values[t] === '',
  );
  if (missing.length > 0) {
    throw new MissingTokenError(transactionType, missing);
  }

  return template.replace(TOKEN_PATTERN, (match, tokenName: string) => {
    const val = values[tokenName];
    return val !== undefined ? String(val) : match;
  });
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Resolve a single transaction_type + tokens to a QBO-ready line.
 *
 * @example
 *   const line = await resolveQboLine(supabase, 'printing', {
 *     title: 'Calabasas Style',
 *     issue_or_date: 'Sept 2026',
 *   });
 *   // line.qbo_account_name = 'Printing'
 *   // line.line_description  = 'Calabasas Style Sept 2026 Printing'
 *   // line.category           = 'cogs'
 *
 *   // Next: the push layer does a fresh QBO query to find Account.Id for name 'Printing'
 */
export async function resolveQboLine(
  supabase: SupabaseClient,
  transactionType: string,
  tokens: TokenValues,
): Promise<ResolvedQboLine> {
  const mappings = await loadMappings(supabase);
  const mapping = mappings.get(transactionType);
  if (!mapping) throw new UnknownTransactionTypeError(transactionType);

  const line_description = renderTemplate(
    mapping.line_description_template,
    mapping.required_tokens,
    tokens,
    transactionType,
  );

  return {
    qbo_account_name: mapping.qbo_account_name,
    line_description,
    category: mapping.category,
  };
}

/**
 * Batch variant — single DB fetch for many lines. Atomic failure: any bad
 * line throws, caller must fix input rather than partial-push to QBO.
 */
export async function resolveQboLines(
  supabase: SupabaseClient,
  lines: Array<{ transactionType: string; tokens: TokenValues }>,
): Promise<ResolvedQboLine[]> {
  const mappings = await loadMappings(supabase);
  return lines.map(({ transactionType, tokens }) => {
    const mapping = mappings.get(transactionType);
    if (!mapping) throw new UnknownTransactionTypeError(transactionType);
    return {
      qbo_account_name: mapping.qbo_account_name,
      line_description: renderTemplate(
        mapping.line_description_template,
        mapping.required_tokens,
        tokens,
        transactionType,
      ),
      category: mapping.category,
    };
  });
}

/** Non-throwing variant for UI validation / preview. */
export async function tryResolveQboLine(
  supabase: SupabaseClient,
  transactionType: string,
  tokens: TokenValues,
): Promise<ResolvedQboLine | null> {
  try {
    return await resolveQboLine(supabase, transactionType, tokens);
  } catch (err) {
    if (err instanceof UnknownTransactionTypeError || err instanceof MissingTokenError) {
      return null;
    }
    throw err;
  }
}

/** List all active mappings (for admin UIs, dropdowns). */
export async function listActiveMappings(
  supabase: SupabaseClient,
): Promise<QboAccountMapping[]> {
  const mappings = await loadMappings(supabase);
  return Array.from(mappings.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name),
  );
}
