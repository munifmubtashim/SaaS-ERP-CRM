import {
  AppError,
  businessDateInDhaka,
  compareMoney,
  formatMoney,
  isZero,
  multiplyByQuantity,
  parseMoney,
  subtractMoney,
  sumMoney,
  ZERO,
  type Paisa,
  type PostedInvoice,
  type PostInvoiceInput,
} from '@erp/shared';
import type { IClock } from './contracts/IClock.js';
import type { ISalesPaymentRecorder } from './contracts/ISalesPaymentRecorder.js';
import type { ISalesQuery, PartyForSale, ProductForSale } from './contracts/ISalesQuery.js';
import type { INumberSeries } from './contracts/provided/INumberSeries.js';
import type { IPostingService, JournalLineDraft } from './contracts/provided/IPostingService.js';
import type { IStockService } from './contracts/provided/IStockService.js';

/** Where and by whom: the request's branch (X-Branch-Id) and the signed-in user, never from the body. */
export interface SaleContext {
  branchId: string;
  userId: string;
}

export interface SalesManagerServices {
  stock: IStockService;
  posting: IPostingService;
  numbers: INumberSeries;
  payments: ISalesPaymentRecorder;
  clock: IClock;
}

interface CheckedLine {
  productId: string;
  serialUnitId: string | null;
  qty: string;
  unitPrice: Paisa;
  lineTotal: Paisa;
}

/** A quantity string with exactly 3 decimals, as the stock ledger stores it ("2" → "2.000"). */
function threeDecimals(qty: string): string {
  const [whole = '0', decimals = ''] = qty.split('.');
  return `${whole}.${decimals.padEnd(3, '0')}`;
}

function refuse(
  code: 'VALIDATION_FAILED' | 'CONFLICT' | 'NOT_FOUND',
  path: string,
  field: string,
  message: string,
) {
  return new AppError(code, message, [{ path, code: field, message }]);
}

/**
 * Sales module: business rules. No Express, no SQL. Owner: Farhan; posting a sale built by Munif for item 3b.
 *
 * `postInvoice` is ADR 0022 section 2, in the request's one transaction: check everything, take the invoice number
 * and every receipt number (ADR 0015 order: documents before journals), move the stock, post the sale's journal,
 * insert the invoice with its journal id (invariant 4), then record each payment through ADR 0016's recorder (one
 * journal and one receipt each). Any refusal throws and the whole request rolls back, numbers included.
 */
export class SalesManager {
  constructor(
    protected readonly query: ISalesQuery,
    private readonly services: SalesManagerServices,
  ) {}

  async postInvoice(input: PostInvoiceInput, where: SaleContext): Promise<PostedInvoice> {
    const lines = await this.checkLines(input, where.branchId);
    const subtotal = sumMoney(lines.map((line) => line.lineTotal));
    const discount = parseMoney(input.discount);
    if (compareMoney(discount, subtotal) > 0) {
      throw refuse(
        'VALIDATION_FAILED',
        'discount',
        'invoice.discount_above_subtotal',
        'The discount is more than the subtotal.',
      );
    }
    const total = subtractMoney(subtotal, discount);
    if (isZero(total))
      throw refuse('VALIDATION_FAILED', 'discount', 'invoice.total_zero', 'The invoice total is zero.');
    const paid = sumMoney(input.payments.map((payment) => parseMoney(payment.amount)));
    if (compareMoney(paid, total) > 0) {
      throw refuse(
        'CONFLICT',
        'payments',
        'invoice.paid_above_total',
        'The payments are more than the invoice total.',
      );
    }
    const party = await this.checkParty(input.partyId);
    if (party.isWalkIn && compareMoney(paid, total) < 0) {
      throw refuse(
        'CONFLICT',
        'partyId',
        'invoice.due_needs_customer',
        'A sale that leaves a due must name the customer, not the walk-in customer.',
      );
    }

    const { stock, posting, numbers, payments, clock } = this.services;
    const date = businessDateInDhaka(clock.now());
    const number = await numbers.next('invoice', where.branchId);
    const receiptNumbers: string[] = [];
    for (const _payment of input.payments) receiptNumbers.push(await numbers.next('receipt', where.branchId));
    const invoiceId = await this.query.newInvoiceId();

    const source = { type: 'sales_invoice', id: invoiceId };
    const { costs } = await stock.move(
      lines.map((line) => ({
        productId: line.productId,
        branchId: where.branchId,
        qtyDelta: `-${line.qty}`,
        ...(line.serialUnitId ? { unitId: line.serialUnitId } : {}),
        kind: 'sale' as const,
        source,
      })),
    );
    const lineCosts = lines.map((line, i) => multiplyByQuantity(parseMoney(costs[i] ?? '0.00'), line.qty));
    const cost = sumMoney(lineCosts);

    const journalLines: JournalLineDraft[] = [
      { role: 'receivable', debit: formatMoney(total), credit: '0.00', partyId: party.id },
      { role: 'sales_revenue', debit: '0.00', credit: formatMoney(total) },
    ];
    if (compareMoney(cost, ZERO) > 0) {
      journalLines.push(
        { role: 'cost_of_goods_sold', debit: formatMoney(cost), credit: '0.00' },
        { role: 'inventory', debit: '0.00', credit: formatMoney(cost) },
      );
    }
    const { journalId } = await posting.post({
      branchId: where.branchId,
      date,
      source,
      memo: `Invoice ${number}`,
      lines: journalLines,
    });

    await this.query.insertInvoice({
      id: invoiceId,
      branchId: where.branchId,
      number,
      partyId: party.id,
      customerName: input.customerName,
      invoiceDate: date,
      subtotal: formatMoney(subtotal),
      discount: formatMoney(discount),
      total: formatMoney(total),
      journalId,
      soldBy: where.userId,
    });
    await this.query.insertInvoiceLines(
      lines.map((line, i) => ({
        invoiceId,
        lineNo: i + 1,
        productId: line.productId,
        serialUnitId: line.serialUnitId,
        qty: line.qty,
        unitPrice: formatMoney(line.unitPrice),
        lineTotal: formatMoney(line.lineTotal),
        costAmount: formatMoney(lineCosts[i] ?? ZERO),
      })),
    );
    const units = lines.flatMap((line) => (line.serialUnitId ? [line.serialUnitId] : []));
    if (units.length > 0 && (await this.query.markUnitsSold(units, invoiceId)) !== units.length) {
      throw refuse('CONFLICT', 'lines', 'unit.not_available', 'A unit on this sale is no longer in stock.');
    }

    const recorded: PostedInvoice['payments'] = [];
    for (const [i, payment] of input.payments.entries()) {
      const done = await payments.record({
        branchId: where.branchId,
        partyId: party.id,
        invoiceId,
        method: payment.method,
        amount: payment.amount,
        externalRef: payment.externalRef,
        receiptNumber: receiptNumbers[i] as string,
      });
      recorded.push({
        id: done.paymentId,
        receiptNumber: done.receiptNumber,
        method: payment.method,
        amount: payment.amount,
        externalRef: payment.externalRef?.trim() || null,
      });
    }

    return {
      id: invoiceId,
      number,
      invoiceDate: date,
      partyId: party.id,
      customerName: input.customerName,
      subtotal: formatMoney(subtotal),
      discount: formatMoney(discount),
      total: formatMoney(total),
      paid: formatMoney(paid),
      due: formatMoney(subtractMoney(total, paid)),
      status: 'posted',
      lines: lines.map((line, i) => ({
        lineNo: i + 1,
        productId: line.productId,
        serialUnitId: line.serialUnitId,
        qty: line.qty,
        unitPrice: formatMoney(line.unitPrice),
        lineTotal: formatMoney(line.lineTotal),
      })),
      payments: recorded,
    };
  }

  /** Every product sellable, every serial product with its own unit at this branch, each unit once (ADR 0020). */
  private async checkLines(input: PostInvoiceInput, branchId: string): Promise<CheckedLine[]> {
    const products = new Map<string, ProductForSale>(
      (await this.query.productsForSale([...new Set(input.lines.map((l) => l.productId))])).map((p) => [
        p.id,
        p,
      ]),
    );
    const unitIds = input.lines.flatMap((l) => (l.serialUnitId ? [l.serialUnitId] : []));
    if (new Set(unitIds).size !== unitIds.length) {
      throw refuse(
        'VALIDATION_FAILED',
        'lines',
        'invoice.unit_repeated',
        'The same unit is on the sale twice.',
      );
    }
    const units = new Map((await this.query.unitsForSale(unitIds)).map((u) => [u.id, u]));
    return input.lines.map((line, i) => {
      const path = `lines.${i}`;
      const product = products.get(line.productId);
      if (!product || product.status !== 'active') {
        throw refuse(
          'CONFLICT',
          `${path}.productId`,
          'invoice.product_unavailable',
          'This product can no longer be sold.',
        );
      }
      if (product.tracking === 'serial' && !line.serialUnitId) {
        throw refuse(
          'VALIDATION_FAILED',
          `${path}.serialUnitId`,
          'invoice.unit_required',
          'Choose the unit sold.',
        );
      }
      if (product.tracking !== 'serial' && line.serialUnitId) {
        throw refuse(
          'VALIDATION_FAILED',
          `${path}.serialUnitId`,
          'invoice.unit_not_serial',
          'This product has no units.',
        );
      }
      if (line.serialUnitId) {
        const unit = units.get(line.serialUnitId);
        if (
          !unit ||
          unit.productId !== line.productId ||
          unit.branchId !== branchId ||
          unit.status !== 'in_stock'
        ) {
          throw refuse(
            'CONFLICT',
            `${path}.serialUnitId`,
            'unit.not_available',
            'This unit is not in stock here.',
          );
        }
      }
      const qty = threeDecimals(line.qty);
      const unitPrice = parseMoney(product.sellPrice);
      return {
        productId: line.productId,
        serialUnitId: line.serialUnitId,
        qty,
        unitPrice,
        lineTotal: multiplyByQuantity(unitPrice, qty),
      };
    });
  }

  private async checkParty(partyId: string): Promise<PartyForSale> {
    const party = await this.query.partyForSale(partyId);
    if (!party || !party.isCustomer || party.status !== 'active') {
      throw refuse('NOT_FOUND', 'partyId', 'invoice.party_unknown', 'Customer not found.');
    }
    return party;
  }
}
