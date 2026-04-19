/**
 * useQboResolver — React hook for the QBO push flow
 *
 * Wraps the resolver + live QBO Id lookup into a single call:
 *   resolveForPush({ transactionType, tokens, qboAccountTypeFilter })
 *     → { qbo_account_name, qbo_account_id, line_description, category }
 *
 * This is the function BillsTab / Billing call before invoking the edge
 * function. Caller should pass qbo_account_id into AccountRef.value of the
 * QBO payload.
 *
 * Failure modes (all throw, caller catches and shows alert):
 *   UnknownTransactionTypeError — type not in qbo_account_mapping
 *   MissingTokenError           — required template token not provided
 *   QboAccountNotFoundError     — canonical name doesn't exist in live QBO CoA
 */

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase'; // existing client
import { resolveQboLine } from '@/lib/qboMappingResolver';
import { resolveLiveQboAccountId } from '@/lib/qboAccountLookup';
import type { TokenValues } from '@/lib/qboMappingTypes';

export interface ResolvedForPush {
  qbo_account_name: string;
  qbo_account_id: string;
  line_description: string;
  category: 'income' | 'cogs' | 'expense' | 'contra_revenue';
}

export function useQboResolver() {
  const resolveForPush = useCallback(
    async (args: {
      transactionType: string;
      tokens: TokenValues;
      /**
       * Restrict the live QBO account query to a type. Omit (All) if you're
       * unsure. Bills use 'Expense' or 'Cost of Goods Sold', invoices use 'Income'.
       */
      qboAccountTypeFilter?: 'Expense' | 'Income' | 'Cost of Goods Sold' | 'All';
    }): Promise<ResolvedForPush> => {
      const { transactionType, tokens, qboAccountTypeFilter = 'All' } = args;

      // Step 1: resolver gives us the canonical name + rendered description
      const resolved = await resolveQboLine(supabase, transactionType, tokens);

      // Step 2: live QBO query finds the actual Id. Fresh every time, NEVER cached.
      const qbo_account_id = await resolveLiveQboAccountId(
        resolved.qbo_account_name,
        qboAccountTypeFilter,
      );

      return {
        qbo_account_name: resolved.qbo_account_name,
        qbo_account_id,
        line_description: resolved.line_description,
        category: resolved.category,
      };
    },
    [],
  );

  return { resolveForPush };
}
