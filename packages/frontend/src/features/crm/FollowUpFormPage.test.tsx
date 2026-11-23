import type {
  CollectorListResponse,
  FollowUp,
  FollowUpListQueryInput,
  FollowUpListResponse,
  RecordFollowUpInput,
} from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { ApiRequestError, type ICrmService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { FollowUpFormPage } from './FollowUpFormPage';

// Obviously fake sample data only.
const PARTY = '0196f000-0000-7000-8000-000000c00001';
const COLLECTOR = '0196f000-0000-7000-8000-000000d00001';

/** Records what the form sends; answers with a fixed result, or a refusal, after `release()` when held. */
class FakeCrmService implements ICrmService {
  readonly recorded: RecordFollowUpInput[] = [];
  private release: (() => void) | null = null;
  constructor(
    private readonly refusal?: Error,
    private readonly hold = false,
  ) {}

  finish() {
    this.release?.();
  }

  async listFollowUps(_query: FollowUpListQueryInput): Promise<FollowUpListResponse> {
    return { items: [], nextCursor: null };
  }

  async listCollectors(): Promise<CollectorListResponse> {
    return { items: [{ id: COLLECTOR, name: 'Sample Collector' }] };
  }

  async recordFollowUp(input: RecordFollowUpInput): Promise<FollowUp> {
    this.recorded.push(input);
    if (this.hold) await new Promise<void>((resolve) => (this.release = resolve));
    if (this.refusal) throw this.refusal;
    return {
      id: '0196f000-0000-7000-8000-000000f01001',
      partyId: input.partyId,
      collectorId: input.collectorId,
      channel: input.channel,
      outcome: input.outcome,
      promise: input.promise && { ...input.promise, status: 'open' },
      note: null,
      contactedAt: '2026-11-23T05:00:00.000Z',
    };
  }
}

/** Stands in for the list: shows the navigation state the form passed (saved flag, filter to open on). */
function ListStub() {
  return (
    <>
      <p>The follow-ups list</p>
      <pre data-testid="list-state">{JSON.stringify(useLocation().state)}</pre>
    </>
  );
}

const listState = () => JSON.parse(screen.getByTestId('list-state').textContent ?? 'null') as unknown;

function renderForm(
  crm: ICrmService,
  {
    locale = 'en',
    state = { partyName: 'Sample Customer 01' },
  }: { locale?: 'en' | 'bn'; state?: unknown } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesContext.Provider value={fakeServices(new FakeHealthService(new Error('unused')), { crm })}>
      <QueryClientProvider client={client}>
        <I18nProvider locale={locale}>
          <MemoryRouter
            initialEntries={[{ pathname: '/follow-ups/new', search: `?partyId=${PARTY}`, state }]}
          >
            <Routes>
              <Route path="/follow-ups/new" element={<FollowUpFormPage />} />
              <Route path="/follow-ups" element={<ListStub />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const refusal = (status: number, path: string, code: string) =>
  new ApiRequestError(status, {
    code: status === 400 ? 'VALIDATION_FAILED' : status === 403 ? 'FORBIDDEN' : 'CONFLICT',
    message: 'refused',
    fields: path ? [{ path, code, message: 'refused' }] : [],
    requestId: 'test',
  });

/** The form's labels in each locale, so the same steps run in English and Bangla. */
const LABELS = {
  en: {
    collector: 'Collector',
    call: 'Call',
    promised: 'Promised',
    promisedOn: 'Promised date',
    amount: 'Promised amount (৳)',
    save: 'Save follow-up',
  },
  bn: {
    collector: 'আদায়কারী',
    call: 'ফোন',
    promised: 'প্রতিশ্রুতি দিয়েছেন',
    promisedOn: 'প্রতিশ্রুত তারিখ',
    amount: 'প্রতিশ্রুত টাকা (৳)',
    save: 'ফলো-আপ সংরক্ষণ করুন',
  },
} as const;

/** Fills a promise to pay for the prefilled customer. */
async function fillPromise(promisedOn = '2026-12-05', amount = '5000.00', locale: 'en' | 'bn' = 'en') {
  const l = LABELS[locale];
  await screen.findByRole('option', { name: 'Sample Collector' }); // the select is disabled until the list loads
  fireEvent.change(screen.getByRole('combobox', { name: l.collector }), { target: { value: COLLECTOR } });
  fireEvent.click(screen.getByRole('radio', { name: l.call }));
  fireEvent.click(screen.getByRole('radio', { name: l.promised }));
  fireEvent.change(screen.getByLabelText(l.promisedOn), { target: { value: promisedOn } });
  fireEvent.change(screen.getByLabelText(l.amount), { target: { value: amount } });
}

const save = (locale: 'en' | 'bn' = 'en') =>
  fireEvent.click(screen.getByRole('button', { name: LABELS[locale].save }));

// jsdom has no scrollIntoView; the form calls it to bring the first invalid field on screen.
const scrolledTo: Element[] = [];
beforeEach(() => {
  scrolledTo.length = 0;
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolledTo.push(this);
  });
});

describe('FollowUpFormPage (CR-05, mock data)', () => {
  it('shows the prefilled customer, and the promise fields only for "promised"', async () => {
    renderForm(new FakeCrmService());
    expect(screen.getByText('Sample Customer 01')).toBeInTheDocument();
    await screen.findByRole('combobox', { name: 'Collector' });
    expect(screen.queryByLabelText('Promised date')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Promised' }));
    expect(screen.getByLabelText('Promised date')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'No answer' }));
    expect(screen.queryByLabelText('Promised amount (৳)')).not.toBeInTheDocument();
  });

  it('asks for the missing fields, and for the date and amount of a promise, without sending anything', async () => {
    const crm = new FakeCrmService();
    renderForm(crm);
    await screen.findByRole('combobox', { name: 'Collector' });
    fireEvent.click(screen.getByRole('radio', { name: 'Promised' }));
    save();
    expect(await screen.findByText('Enter the promised date and amount.')).toBeInTheDocument();
    expect(screen.getAllByText('Fill in this field.')).toHaveLength(2); // collector and channel
    expect(screen.getByLabelText('Promised date')).toHaveAttribute('aria-invalid', 'true');
    expect(crm.recorded).toEqual([]);
  });

  it('sends the follow-up, disables Save while saving, then returns to the list', async () => {
    const crm = new FakeCrmService(undefined, true);
    renderForm(crm);
    await fillPromise();
    save();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());
    crm.finish();
    expect(await screen.findByText('The follow-ups list')).toBeInTheDocument();
    // A promise is Open, so the list opens there with a "saved" message, not on Broken where it can't be seen.
    expect(listState()).toEqual({ saved: true, promiseStatus: 'open' });
    expect(crm.recorded).toEqual([
      {
        partyId: PARTY,
        collectorId: COLLECTOR,
        channel: 'call',
        outcome: 'promised',
        promise: { promisedOn: '2026-12-05', amount: '5000.00' },
        note: null,
      },
    ]);
  });

  it('returns to the list with only the saved flag when there was no promise', async () => {
    renderForm(new FakeCrmService());
    await screen.findByRole('option', { name: 'Sample Collector' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Collector' }), { target: { value: COLLECTOR } });
    fireEvent.click(screen.getByRole('radio', { name: 'Visit' }));
    fireEvent.click(screen.getByRole('radio', { name: 'No answer' }));
    save();
    expect(await screen.findByText('The follow-ups list')).toBeInTheDocument();
    expect(listState()).toEqual({ saved: true });
  });

  it('moves focus to the first invalid field and scrolls it into view', async () => {
    renderForm(new FakeCrmService());
    const collector = await screen.findByRole('combobox', { name: 'Collector' });
    await screen.findByRole('option', { name: 'Sample Collector' });
    save();
    await waitFor(() => expect(collector).toHaveFocus());
    expect(scrolledTo).toEqual([collector]);
  });

  it('moves focus to the first channel choice when the collector is set but the channel is not', async () => {
    renderForm(new FakeCrmService());
    await screen.findByRole('option', { name: 'Sample Collector' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Collector' }), { target: { value: COLLECTOR } });
    save();
    const call = screen.getByRole('radio', { name: 'Call' });
    await waitFor(() => expect(call).toHaveFocus());
    expect(scrolledTo).toEqual([call]);
  });

  it('moves focus to the date when the server refuses it, and shows followup.promise_date_past there', async () => {
    renderForm(new FakeCrmService(refusal(400, 'promise.promisedOn', 'followup.promise_date_past')));
    await fillPromise();
    save();
    expect(await screen.findByText('The promised date cannot be before today.')).toBeInTheDocument();
    const date = screen.getByLabelText('Promised date');
    expect(date).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(date).toHaveFocus());
    expect(scrolledTo).toEqual([date]);
  });

  it.each([
    ['en', 409, 'followup.walk_in_not_allowed', 'The walk-in customer has no dues to follow up.'],
    ['bn', 409, 'followup.walk_in_not_allowed', 'ওয়াক-ইন গ্রাহকের কোনো বকেয়া নেই, তাই ফলো-আপ লাগে না।'],
    ['en', 400, 'followup.party_not_found', 'This customer was not found. It may have been removed.'],
    ['bn', 400, 'followup.party_not_found', 'এই গ্রাহককে পাওয়া যায়নি। হয়তো মুছে ফেলা হয়েছে।'],
  ] as const)(
    'shows %s %s %s as a banner, moves focus to it and scrolls it into view',
    async (locale, status, code, text) => {
      renderForm(new FakeCrmService(refusal(status, 'partyId', code)), { locale });
      await fillPromise(undefined, undefined, locale);
      save(locale);
      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent(text);
      expect(banner).toHaveAttribute('tabindex', '-1');
      await waitFor(() => expect(banner).toHaveFocus());
      expect(scrolledTo).toEqual([banner]);
    },
  );

  it('shows the permission message on a 403', async () => {
    renderForm(new FakeCrmService(refusal(403, '', '')));
    await fillPromise();
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to record follow-ups.',
    );
  });

  it('asks to open the form from the list when it has no customer', () => {
    renderForm(new FakeCrmService(), { state: null });
    expect(screen.getByText('Open this form from a follow-up in the list.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save follow-up' })).not.toBeInTheDocument();
  });

  it('is in Bangla, messages included', async () => {
    renderForm(new FakeCrmService(), { locale: 'bn' });
    await screen.findByRole('combobox', { name: 'আদায়কারী' });
    fireEvent.click(screen.getByRole('radio', { name: 'প্রতিশ্রুতি দিয়েছেন' }));
    fireEvent.click(screen.getByRole('button', { name: 'ফলো-আপ সংরক্ষণ করুন' }));
    expect(await screen.findByText('প্রতিশ্রুত তারিখ ও টাকা লিখুন।')).toBeInTheDocument();
  });
});
