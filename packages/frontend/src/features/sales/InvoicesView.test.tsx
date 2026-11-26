import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { ApiRequestError, type DemoService, type ISalesService } from '../../services';
import { SampleSalesService } from '../../services/sample/SampleSalesService';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { PosPage } from './PosPage';
import { en } from '../../i18n/en';

const EXCEEDS_DUE = en['payment.error.exceedsDue'];

/** The Invoices half of Sales / POS (design/owner-dashboard/Sales.dc.html) over the sample, pinned to one day. */
function renderInvoices(
  locale: 'en' | 'bn' = 'en',
  sales: ISalesService = new SampleSalesService(0, '2026-11-12'),
) {
  const services = fakeServices(new FakeHealthService(new Error('unused')), {
    sales,
    demo: new Set<DemoService>(['sales.invoices']),
  });
  render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <PosPage />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Invoices' : 'ইনভয়েস' }));
}

const list = () => screen.getByRole('region', { name: 'Invoices' });
const details = () => screen.getByRole('region', { name: 'Invoice details' });
const open = async (number: string) =>
  fireEvent.click(await within(list()).findByRole('button', { name: new RegExp(number) }));

describe('Invoices view', () => {
  it('switches from Point of sale to Invoices and lists every invoice, newest first, with its status in words', async () => {
    renderInvoices();
    expect(screen.getByRole('button', { name: 'Invoices' })).toHaveAttribute('aria-pressed', 'true');
    const rows = await within(list()).findAllByRole('button', { name: /^C-0001/ });
    expect(rows.map((r) => r.textContent?.slice(0, 8))).toEqual([
      'C-000123',
      'C-000122',
      'C-000121',
      'C-000120',
      'C-000119',
      'C-000118',
      'C-000117',
    ]);
    expect(rows[1]).toHaveTextContent('Partly paid');
    expect(within(list()).getByText('Showing 7 of 7 invoices, newest first.')).toBeInTheDocument();
  });

  it('filters by payment status', async () => {
    renderInvoices();
    await within(list()).findAllByRole('button', { name: /^C-0001/ });
    fireEvent.click(within(list()).getByRole('button', { name: 'Due' }));
    const rows = within(list()).getAllByRole('button', { name: /^C-0001/ });
    expect(rows.map((r) => r.textContent?.slice(0, 8))).toEqual(['C-000120', 'C-000117']);
  });

  it('asks to pick an invoice, then shows its items, payments and balance', async () => {
    renderInvoices();
    expect(within(details()).getByText('Pick an invoice')).toBeInTheDocument();
    await open('C-000122');
    expect(await within(details()).findByText('Ridge 125 S, RG1-000199')).toBeInTheDocument();
    expect(details()).toHaveTextContent('Sample Customer One');
    expect(details()).toHaveTextContent('৳1,65,000'); // total after the ৳3,000 discount
    expect(details()).toHaveTextContent('৳65,000'); // balance due
    expect(within(details()).getByText(/Receipt R-\d{6}/)).toBeInTheDocument(); // ADR 0016 line 19
  });

  it('collects a payment: refuses zero and more than the balance, then saves and moves the status', async () => {
    renderInvoices();
    await open('C-000122');
    const amount = await within(details()).findByLabelText('Amount in taka');
    const save = within(details()).getByRole('button', { name: 'Save payment' });
    fireEvent.click(save);
    expect(within(details()).getByRole('alert')).toHaveTextContent('Enter an amount above zero.');
    fireEvent.change(amount, { target: { value: '70000' } });
    fireEvent.click(save);
    expect(within(details()).getByRole('alert')).toHaveTextContent(
      'That is more than the ৳65,000 still due.',
    );
    fireEvent.change(amount, { target: { value: '65,000' } });
    const methods = within(details()).getByRole('group', { name: 'Payment method' });
    expect(
      within(methods)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cash', 'bKash']);
    fireEvent.click(within(methods).getByRole('button', { name: 'bKash' }));
    fireEvent.click(save);
    expect(within(details()).getByRole('alert')).toHaveTextContent('Enter the bKash transaction ID.');
    fireEvent.change(within(details()).getByLabelText('bKash transaction ID'), {
      target: { value: 'BK7X2Q9' },
    });
    fireEvent.click(save);
    expect(await screen.findByText('৳65,000 saved on C-000122.')).toBeInTheDocument();
    expect(await within(list()).findByRole('button', { name: /C-000122.*Paid/ })).toBeInTheDocument();
    expect(within(details()).queryByRole('button', { name: 'Save payment' })).toBeNull(); // nothing left to collect
  });

  it('a retry after a failed save uses the same Idempotency-Key, so it can never collect twice', async () => {
    const sample = new SampleSalesService(0, '2026-11-12');
    const keys: string[] = [];
    let fail = true;
    const sales: ISalesService = {
      ...sample,
      recordPayment: (invoice, payment, key) => {
        keys.push(key);
        if (fail) return Promise.reject(new Error('timeout'));
        return sample.recordPayment(invoice, payment, key);
      },
    };
    renderInvoices('en', sales);
    await open('C-000122');
    fireEvent.change(await within(details()).findByLabelText('Amount in taka'), {
      target: { value: '5000' },
    });
    fireEvent.click(within(details()).getByRole('button', { name: 'Save payment' }));
    expect(await within(details()).findByRole('alert')).toHaveTextContent(
      'The payment was not saved. Try again.',
    );
    fail = false;
    fireEvent.click(within(details()).getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByText('৳5,000 saved on C-000122.')).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('Collect pays this invoice of this customer (POST /v1/payments needs both, ADR 0057)', async () => {
    const sample = new SampleSalesService(0, '2026-11-12');
    const paid: { id: string; partyId: string }[] = [];
    const sales: ISalesService = {
      ...sample,
      recordPayment: (invoice, payment, key) => {
        paid.push({ id: invoice.id, partyId: invoice.partyId });
        return sample.recordPayment(invoice, payment, key);
      },
    };
    renderInvoices('en', sales);
    await open('C-000122');
    fireEvent.change(await within(details()).findByLabelText('Amount in taka'), {
      target: { value: '5000' },
    });
    fireEvent.click(within(details()).getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByText('৳5,000 saved on C-000122.')).toBeInTheDocument();
    const c122 = (await sample.invoices()).find((i) => i.number === 'C-000122');
    expect(paid).toEqual([{ id: c122?.id, partyId: c122?.partyId }]);
  });

  it('a refusal (409 payment.exceeds_due) is named like Record payment; the next save is a new attempt with a new key', async () => {
    const sample = new SampleSalesService(0, '2026-11-12');
    const keys: string[] = [];
    let refuse = true;
    let detailReads = 0;
    const sales: ISalesService = {
      ...sample,
      invoice: (id) => {
        detailReads += 1;
        return sample.invoice(id);
      },
      recordPayment: (invoice, payment, key) => {
        keys.push(key);
        if (refuse)
          return Promise.reject(
            new ApiRequestError(409, {
              code: 'CONFLICT',
              message: 'More than is due',
              fields: [{ path: 'amount', code: 'payment.exceeds_due', message: 'More than is due' }],
              requestId: 'req-1',
            }),
          );
        return sample.recordPayment(invoice, payment, key);
      },
    };
    renderInvoices('en', sales);
    await open('C-000122');
    fireEvent.change(await within(details()).findByLabelText('Amount in taka'), {
      target: { value: '5000' },
    });
    const readsBefore = detailReads;
    fireEvent.click(within(details()).getByRole('button', { name: 'Save payment' }));
    expect(await within(details()).findByRole('alert')).toHaveTextContent(EXCEEDS_DUE);
    // What is due may have changed elsewhere: the invoice is read again.
    await waitFor(() => expect(detailReads).toBeGreaterThan(readsBefore));
    refuse = false;
    fireEvent.click(within(details()).getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByText('৳5,000 saved on C-000122.')).toBeInTheDocument();
    // A refusal recorded nothing, so the next attempt may take a new key; a retry after a timeout keeps it (above).
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('a voided invoice (#221 status) says Voided, is left out of Due, and takes no payment', async () => {
    const sample = new SampleSalesService(0, '2026-11-12');
    const voided = <T extends { number: string; status: string }>(i: T): T =>
      i.number === 'C-000120' ? { ...i, status: 'voided' } : i;
    const sales: ISalesService = {
      ...sample,
      invoices: async () => (await sample.invoices()).map(voided),
      invoice: async (id) => voided(await sample.invoice(id)),
    };
    renderInvoices('en', sales);
    expect(await within(list()).findByRole('button', { name: /C-000120.*Voided/ })).toBeInTheDocument();
    fireEvent.click(within(list()).getByRole('button', { name: 'Due' }));
    expect(
      within(list())
        .getAllByRole('button', { name: /^C-0001/ })
        .map((r) => r.textContent?.slice(0, 8)),
    ).toEqual(['C-000117']);
    fireEvent.click(within(list()).getByRole('button', { name: 'All' }));
    await open('C-000120');
    expect(await within(details()).findByText('Chain and sprocket kit')).toBeInTheDocument();
    expect(within(details()).queryByRole('button', { name: 'Save payment' })).toBeNull();
  });

  it('print and return are shown but not available yet', async () => {
    renderInvoices();
    await open('C-000123');
    for (const name of ['Print invoice', 'Start a return']) {
      const button = await within(details()).findByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Not available yet');
    }
  });

  it('renders in Bangla', async () => {
    renderInvoices('bn');
    expect(await screen.findByText('৭টির মধ্যে ৭টি ইনভয়েস, নতুনগুলো আগে।')).toBeInTheDocument();
  });
});
