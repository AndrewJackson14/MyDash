/**
 * QBO Account Mapping — TypeScript types
 *
 * Mirrors the `qbo_account_mapping` table. If you add columns to the table,
 * update this file. Transaction types are typed as `string` — the database
 * is the source of truth for the valid set; the resolver validates at runtime.
 */

export type QboTransactionCategory =
  | 'income'
  | 'cogs'
  | 'expense'
  | 'contra_revenue';

export interface QboAccountMapping {
  id: string;
  transaction_type: string;
  category: QboTransactionCategory;
  display_name: string;
  qbo_account_name: string;
  line_description_template: string;
  required_tokens: string[];
  example: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Input to the resolver. Stringify dates/numbers before passing in. */
export type TokenValues = Record<string, string>;

/** Resolver output — exactly what the QBO push layer needs before live Id lookup. */
export interface ResolvedQboLine {
  qbo_account_name: string;
  line_description: string;
  category: QboTransactionCategory;
}

export class UnknownTransactionTypeError extends Error {
  constructor(public readonly transactionType: string) {
    super(`No active QBO account mapping found for transaction_type="${transactionType}"`);
    this.name = 'UnknownTransactionTypeError';
  }
}

export class MissingTokenError extends Error {
  constructor(
    public readonly transactionType: string,
    public readonly missing: string[],
  ) {
    super(
      `Transaction type "${transactionType}" requires tokens [${missing.join(', ')}] ` +
      `but they were not provided.`,
    );
    this.name = 'MissingTokenError';
  }
}
