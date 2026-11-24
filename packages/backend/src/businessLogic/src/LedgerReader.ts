import { AppError, formatMoney, parseMoney, subtractMoney, sumMoney } from '@erp/shared';
import type { ILedgerQuery } from './contracts/ILedgerQuery.js';
import type { IPartyLedger, PartyBalances } from './contracts/provided/IPartyLedger.js';
import type { ITrialBalance, TrialBalance } from './contracts/provided/ITrialBalance.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accounting's ledger reads (M4): IPartyLedger for the dues read and the credit check, ITrialBalance for the
 * accountant. Both come from the journal lines, the truth (invariant 1). Runs in the caller's transaction and scope;
 * never writes. Money comes from the database as numeric text and is summed and signed only with the shared helpers.
 */
export class LedgerReader implements IPartyLedger, ITrialBalance {
  constructor(private readonly ledger: ILedgerQuery) {}

  async balances(partyId: string): Promise<PartyBalances> {
    const row = await this.ledger.partyBalances(partyId);
    return {
      receivable: formatMoney(parseMoney(row.receivable)),
      customerAdvance: formatMoney(parseMoney(row.customerAdvance)),
    };
  }

  async read(asOf?: string): Promise<TrialBalance> {
    if (asOf !== undefined && !ISO_DATE.test(asOf)) {
      throw new AppError('INTERNAL_ERROR', `Not a YYYY-MM-DD business date: ${asOf}`);
    }
    const totals = await this.ledger.accountTotals(asOf ?? null);
    const rows = totals.map((t) => {
      const debit = parseMoney(t.debit);
      const credit = parseMoney(t.credit);
      return {
        accountId: t.accountId,
        code: t.code,
        name: t.name,
        type: t.type,
        debit: formatMoney(debit),
        credit: formatMoney(credit),
        balance: formatMoney(subtractMoney(debit, credit)),
      };
    });
    return {
      rows,
      totals: {
        debit: formatMoney(sumMoney(totals.map((t) => parseMoney(t.debit)))),
        credit: formatMoney(sumMoney(totals.map((t) => parseMoney(t.credit)))),
      },
    };
  }
}
