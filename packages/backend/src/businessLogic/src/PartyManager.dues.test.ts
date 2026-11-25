import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IOpenInvoiceQuery, OpenInvoiceRecord } from './contracts/IOpenInvoiceQuery.js';
import type { IPartyQuery, PartyRecord } from './contracts/IPartyQuery.js';
import type { IPartyLedger, PartyBalances } from './contracts/provided/IPartyLedger.js';
import { PartyManager } from './PartyManager.js';
import { FakeNumberSeries } from './test/FakeNumberSeries.js';

/**
 * F5, GET /v1/parties/:id/dues (ADR 0059 section 1, ADR 0026 section 3) over fakes: the totals come from the ledger,
 * the open invoices from the documents. The real reads are dues.isolation.test.ts. Every value is invented.
 */
const ID = '0196f000-0000-7000-8000-000000000501';

const record = (overrides: Partial<PartyRecord> = {}): PartyRecord => ({
  id: ID,
  businessId: '0196f000-0000-7000-8000-0000000000a1',
  code: 'C-000005',
  name: 'Shirin Akter',
  nameBn: null,
  kind: 'person',
  isCustomer: true,
  isSupplier: false,
  isWalkIn: false,
  phoneE164: '+8801700000005',
  altPhoneE164: null,
  email: null,
  address: null,
  area: null,
  creditLimit: null,
  payTermDays: null,
  status: 'active',
  createdAt: new Date('2026-11-01T04:00:00Z'),
  updatedAt: new Date('2026-11-01T04:00:00Z'),
  version: 1,
  ...overrides,
});

/** Only find is used by dues. */
const partyQuery = (rows: PartyRecord[]): IPartyQuery =>
  ({ find: async (id: string) => rows.find((r) => r.id === id) ?? null }) as unknown as IPartyQuery;

class FakeLedger implements IPartyLedger {
  asked: string[] = [];
  constructor(private readonly answer: PartyBalances) {}
  async balances(partyId: string): Promise<PartyBalances> {
    this.asked.push(partyId);
    return this.answer;
  }
}

class FakeOpenInvoices implements IOpenInvoiceQuery {
  asked: string[] = [];
  constructor(private readonly rows: OpenInvoiceRecord[]) {}
  async openInvoices(partyId: string): Promise<OpenInvoiceRecord[]> {
    this.asked.push(partyId);
    return this.rows;
  }
}

const open: OpenInvoiceRecord[] = [
  {
    invoiceId: '0196f000-0000-7000-8000-0000000005a1',
    invoiceNumber: 'INV-000003',
    invoiceDate: '2026-11-02',
    total: '1000.00',
    paid: '400.00',
    due: '600.00',
  },
  {
    invoiceId: '0196f000-0000-7000-8000-0000000005a2',
    invoiceNumber: 'INV-000007',
    invoiceDate: '2026-11-09',
    total: '2000.00',
    paid: '0.00',
    due: '2000.00',
  },
];

function setup(rows: PartyRecord[], balances: PartyBalances, invoices: OpenInvoiceRecord[] = open) {
  const ledger = new FakeLedger(balances);
  const documents = new FakeOpenInvoices(invoices);
  const manager = new PartyManager(partyQuery(rows), new FakeNumberSeries('C-'), {
    ledger,
    openInvoices: documents,
  });
  return { manager, ledger, documents };
}

describe('dues (ADR 0059 section 1)', () => {
  it('the totals come from the ledger and the list from the documents, unchanged', async () => {
    const { manager, ledger, documents } = setup([record()], {
      receivable: '2600.00',
      customerAdvance: '300.00',
    });
    expect(await manager.dues(ID)).toEqual({
      partyId: ID,
      totalDue: '2600.00',
      advance: '300.00',
      openInvoices: open,
    });
    expect(ledger.asked).toEqual([ID]);
    expect(documents.asked).toEqual([ID]);
  });

  it('an unknown id, a guessed one, or a supplier-only party is 404 party.not_found, and nothing is read', async () => {
    for (const [id, rows] of [
      ['not-a-uuid', [record()]],
      ['0196f000-0000-7000-8000-00000000ffff', [record()]],
      [ID, [record({ isCustomer: false, isSupplier: true })]],
    ] as const) {
      const { manager, ledger, documents } = setup([...rows], {
        receivable: '0.00',
        customerAdvance: '0.00',
      });
      const error = await manager.dues(id).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('NOT_FOUND');
      expect(ledger.asked).toEqual([]);
      expect(documents.asked).toEqual([]);
    }
  });

  it('the walk-in customer answers its ledger figures too (zero when every sale was paid)', async () => {
    const { manager } = setup(
      [record({ isWalkIn: true })],
      { receivable: '0.00', customerAdvance: '0.00' },
      [],
    );
    expect(await manager.dues(ID)).toEqual({
      partyId: ID,
      totalDue: '0.00',
      advance: '0.00',
      openInvoices: [],
    });
  });
});
