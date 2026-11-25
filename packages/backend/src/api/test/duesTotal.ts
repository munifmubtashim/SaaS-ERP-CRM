import { formatMoney, parseMoney, sumMoney } from '@erp/shared';

/**
 * The sum of a dues answer's open invoice dues, as a money string, through the shared money helpers only: no floats and
 * no arithmetic on the strings (CLAUDE.md, money and dates). ADR 0059 test 1 compares it with the ledger's totalDue.
 */
export function openDuesTotal(dues: { openInvoices: readonly { due: string }[] }): string {
  return formatMoney(sumMoney(dues.openInvoices.map((invoice) => parseMoney(invoice.due))));
}
