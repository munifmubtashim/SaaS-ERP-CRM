import { AppError, compareMoney, parseMoney, ZERO } from '@erp/shared';
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
  /** Business date in Asia/Dhaka, "YYYY-MM-DD". */
  date: string;
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
    methods: readonly IPaymentMethodRule[],
  ) {
    this.methods = new Map(methods.map((rule) => [rule.method, rule]));
  }

  async record(input: RecordPaymentInput): Promise<RecordedPayment> {
    const rule = this.validate(input);
    const receiptNumber = await this.numbers.next('receipt', input.branchId);
    const paymentId = await this.query.newPaymentId();
    const { journalId } = await this.posting.post({
      branchId: input.branchId,
      date: input.date,
      source: { type: 'sales_payment', id: paymentId },
      memo: `Payment ${receiptNumber}`,
      lines: [
        { role: rule.debitRole, debit: input.amount, credit: '0.00' },
        {
          role: input.invoiceId === null ? 'customer_advance' : 'receivable',
          debit: '0.00',
          credit: input.amount,
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
      amount: input.amount,
      externalRef: input.externalRef,
      receiptNumber,
      journalId,
    });
    return { paymentId, receiptNumber, journalId };
  }

  private validate(input: RecordPaymentInput): IPaymentMethodRule {
    const rule = this.methods.get(input.method);
    if (!rule) throw invalid('method', 'payment.method_unknown', 'This payment method is not available.');
    let amount;
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
    return rule;
  }
}

function invalid(path: string, code: string, message: string): AppError {
  return new AppError('VALIDATION_FAILED', message, [{ path, code, message }]);
}
