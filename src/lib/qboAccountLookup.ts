/**
 * QBO Account Lookup — live Id resolution
 *
 * Given a canonical account name (from the resolver), fetches the current
 * QBO account list and finds the Id whose Name matches case-insensitively.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ DO NOT CACHE THIS.                                                  │
 * │                                                                     │
 * │ Do not wrap this in useQuery, useSWR, useMemo, React.cache, or any  │
 * │ memoization. Do not extract into a hook that caches. Do not add     │
 * │ a "5 second TTL to avoid duplicate calls during multi-line push" —  │
 * │ if you think that's valuable, use resolveQboLinesForPush() to batch │
 * │ at the call site instead.                                           │
 * │                                                                     │
 * │ A fresh query per push is the whole point: if someone renames an    │
 * │ account in QBO mid-session, the next push must fail loudly with     │
 * │ QboAccountNotFoundError. A stale cache turns that into a silent     │
 * │ wrong-account write. Given pushes happen one-at-a-time at human     │
 * │ speed, the fresh query adds ~200ms per push, which is fine.         │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Throws QboAccountNotFoundError with the list of live names so the UX
 * guides the user to fix their QBO chart of accounts (same pattern as
 * existing BillsTab behavior).
 */

import { supabase } from './supabase'; // existing MyDash supabase client

interface QboAccount {
  Id: string;
  Name: string;
  AccountType: string;
}

export class QboAccountNotFoundError extends Error {
  constructor(
    public readonly wantedName: string,
    public readonly availableNames: string[],
  ) {
    super(
      `QBO account "${wantedName}" not found. Available: ${availableNames.join(', ')}. ` +
      `The MyDash mapping references an account name that doesn't exist in QBO. ` +
      `Either create the account in QBO, or update qbo_account_mapping.qbo_account_name ` +
      `to match an existing account.`,
    );
    this.name = 'QboAccountNotFoundError';
  }
}

type QboAccountTypeFilter = 'Expense' | 'Income' | 'Cost of Goods Sold' | 'All';

/**
 * Query QBO for accounts of a given type (or all), then case-insensitively
 * match the wanted name and return the Id.
 *
 * @param wantedName — canonical name from qbo_account_mapping.qbo_account_name
 * @param typeFilter — restrict query to a type (faster + safer). 'All' omits filter.
 * @returns Account.Id to use in QBO payloads (e.g. AccountRef.value)
 */
export async function resolveLiveQboAccountId(
  wantedName: string,
  typeFilter: QboAccountTypeFilter = 'All',
): Promise<string> {
  const sql =
    typeFilter === 'All'
      ? `SELECT Id, Name, AccountType FROM Account`
      : `SELECT Id, Name, AccountType FROM Account WHERE AccountType='${typeFilter}'`;

  const { data, error } = await supabase.functions.invoke('qb-api', {
    body: { query: sql },
    headers: { 'x-action': 'query' },
  });

  if (error) {
    throw new Error(`Failed to query QBO accounts: ${error.message}`);
  }

  const accounts: QboAccount[] = data?.QueryResponse?.Account ?? [];

  const match = accounts.find(
    (a) => a.Name.toLowerCase() === wantedName.toLowerCase(),
  );

  if (!match) {
    throw new QboAccountNotFoundError(
      wantedName,
      accounts.map((a) => a.Name).sort(),
    );
  }

  return match.Id;
}
