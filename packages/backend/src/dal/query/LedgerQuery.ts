import { BaseQuery } from './BaseQuery.js';

/**
 * Reads of the accounting core (M4): a party's balances and the trial balance's account totals. Satisfies
 * businessLogic's contracts/ILedgerQuery. Read-only, inside the request's tenant transaction, under RLS (journal lines
 * follow their journal's branch). The database sums the amounts exactly (numeric); nothing here formats money.
 */
export class LedgerQuery extends BaseQuery {
  async partyBalances(partyId: string): Promise<{ receivable: string; customerAdvance: string }> {
    const [row] = await this.db.$queryRaw<{ receivable: string; customerAdvance: string }[]>`
      SELECT coalesce(sum(l.debit - l.credit) FILTER (WHERE r.role = 'receivable'), 0)::numeric(18,2)::text
               AS receivable,
             coalesce(sum(l.credit - l.debit) FILTER (WHERE r.role = 'customer_advance'), 0)::numeric(18,2)::text
               AS "customerAdvance"
        FROM journal_line l
        JOIN account_role r ON r.business_id = l.business_id AND r.account_id = l.account_id
       WHERE l.party_id = ${partyId}::uuid AND r.role IN ('receivable', 'customer_advance')`;
    return row ?? { receivable: '0.00', customerAdvance: '0.00' };
  }

  async accountTotals(
    asOf: string | null,
  ): Promise<
    { accountId: string; code: string; name: string; type: string; debit: string; credit: string }[]
  > {
    return this.db.$queryRaw`
      SELECT a.id::text AS "accountId", a.code, a.name, a.type,
             sum(l.debit)::numeric(18,2)::text AS debit, sum(l.credit)::numeric(18,2)::text AS credit
        FROM journal_line l
        JOIN journal j ON j.id = l.journal_id
        JOIN account a ON a.business_id = l.business_id AND a.id = l.account_id
       WHERE ${asOf}::date IS NULL OR j.journal_date <= ${asOf}::date
       GROUP BY a.id, a.code, a.name, a.type
       ORDER BY a.code`;
  }
}
