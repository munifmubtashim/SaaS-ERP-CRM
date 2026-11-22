import {
  AppError,
  businessDateInDhaka,
  compareMoney,
  formatMoney,
  parseMoney,
  ZERO,
  type Paisa,
} from '@erp/shared';
import type { IClock } from './contracts/IClock.js';
import type { IPaymentMethodRule } from './contracts/IPaymentMethodRule.js';
import type { ISalesPaymentQuery } from './contracts/ISalesPaymentQuery.js';
import type { INumberSeries } from './contracts/provided/INumberSeries.js';
import type { IPostingService } from './contracts/provided/IPostingService.js';

export interface RecordPaymentInput {
  branchId: string;
  partyId: string;
  /** Null records an advance (B-02). */
  invoiceId: string | null;
  method: string;
  /** Two-decimal money string, above zero. */
  amount: string;
  externalRef: string | null;
}

export interface RecordedPayment {
  paymentId: string;
  receiptNumber: string;
  journalId: string;
}

/**
 * Records a customer payment and posts its journal (ADR 0016 section 1), inside the caller's one request
 * transaction: validate, take the receipt number, get the id, post, then insert the payment with its journal id.
 * Any failure rolls all of it back, number included. The payment method decides the debit role; this class never
 * names an account. Sales (Farhan) owns it; it waits for A15's table before createManagers wires it.
 */
export class SalesPaymentRecorder {
  private readonly methods: ReadonlyMap<string, IPaymentMethodRule>;

  constructor(
    private readonly query: ISalesPaymentQuery,
    private readonly posting: IPostingService,
    private readonly numbers: INumberSeries,
    private readonly clock: IClock,
    methods: readonly IPaymentMethodRule[],
  ) {
    const byMethod = new Map<string, IPaymentMethodRule>();
    for (const rule of methods) {
      if (byMethod.has(rule.method)) throw new Error(`Payment method ${rule.method} is registered twice.`);
      byMethod.set(rule.method, rule);
    }
    this.methods = byMethod;
  }

  async record(input: RecordPaymentInput): Promise<RecordedPayment> {
    const { rule, amount } = this.validate(input);
    if (input.invoiceId !== null) await this.refuseAboveDue(input.invoiceId, input.partyId, amount);
    else await this.refuseUnknownParty(input.partyId);
    // One stored form: "012500.00" is stored and posted as "12500.00" (Farhan, #99).
    const amountText = formatMoney(amount);
    const externalRef = input.externalRef?.trim() || null;
    const receiptNumber = await this.numbers.next('receipt', input.branchId);
    const paymentId = await this.query.newPaymentId();
    const { journalId } = await this.posting.post({
      branchId: input.branchId,
      // The business date comes from the server clock in Dhaka, never from the caller (no back-dating).
      date: businessDateInDhaka(this.clock.now()),
      source: { type: 'sales_payment', id: paymentId },
      memo: `Payment ${receiptNumber}`,
      lines: [
        { role: rule.debitRole, debit: amountText, credit: '0.00' },
        {
          role: input.invoiceId === null ? 'customer_advance' : 'receivable',
          debit: '0.00',
          credit: amountText,
          partyId: input.partyId,
        },
      ],
    });
    await this.query.insertPayment({
      id: paymentId,
      branchId: input.branchId,
      partyId: input.partyId,
      invoiceId: input.invoiceId,
      method: rule.method,
      amount: amountText,
      externalRef,
      receiptNumber,
      journalId,
    });
    return { paymentId, receiptNumber, journalId };
  }

  /**
   * Release 1 refuses overpayment (Farhan's decision on #99; ADR 0016 amendment wording on #43): a payment above the
   * invoice's open due would push receivable below zero. The cashier records any excess as a separate advance.
   */
  private async refuseAboveDue(invoiceId: string, partyId: string, amount: Paisa): Promise<void> {
    const due = await this.query.invoiceDueForUpdate(invoiceId, partyId);
    if (due === null) {
      const message = 'Invoice not found for this customer.';
      throw new AppError('NOT_FOUND', message, [
        { path: 'invoiceId', code: 'payment.invoice_not_found', message },
      ]);
    }
    if (compareMoney(amount, parseMoney(due)) > 0) {
      const message = 'The payment is more than the amount due on this invoice.';
      throw new AppError('CONFLICT', message, [{ path: 'amount', code: 'payment.exceeds_due', message }]);
    }
  }

  /** An advance names a party that no invoice vouches for: it must exist in this business (Farhan, #99). */
  private async refuseUnknownParty(partyId: string): Promise<void> {
    if (await this.query.partyInScope(partyId)) return;
    const message = 'Customer not found.';
    throw new AppError('NOT_FOUND', message, [{ path: 'partyId', code: 'payment.party_not_found', message }]);
  }

  private validate(input: RecordPaymentInput): { rule: IPaymentMethodRule; amount: Paisa } {
    const rule = this.methods.get(input.method);
    if (!rule) throw invalid('method', 'payment.method_unknown', 'This payment method is not available.');
    let amount: Paisa;
    try {
      amount = parseMoney(input.amount);
    } catch {
      throw invalid('amount', 'payment.amount_invalid', 'Enter the amount with two decimals.');
    }
    if (compareMoney(amount, ZERO) <= 0) {
      throw invalid('amount', 'payment.amount_invalid', 'The amount must be above zero.');
    }
    if (rule.needsExternalRef && !input.externalRef?.trim()) {
      throw invalid(
        'externalRef',
        'payment.external_ref_required',
        'Enter the transaction or reference number.',
      );
    }
    return { rule, amount };
  }
}

function invalid(path: string, code: string, message: string): AppError {
  return new AppError('VALIDATION_FAILED', message, [{ path, code, message }]);
}
