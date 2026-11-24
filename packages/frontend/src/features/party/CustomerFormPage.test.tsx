import type { CreatePartyInput, ErrorCode, Party, PartyDetail, UpdatePartyInput } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { ApiRequestError, type IPartyService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { CustomerFormPage } from './CustomerFormPage';

/**
 * The add and edit customer form (task 4 T3; ADR 0056): POST and PATCH /v1/parties through IPartyService. The phone is
 * checked with the shared rule before anything is sent; the duplicate-phone 409 lists the matches and offers to save
 * anyway; a stale version says someone else changed it. Every value is invented.
 */
const ID = '0196f000-0000-7000-8000-000000000501';
const saved = (fields: Partial<Party> = {}): Party => ({
  id: ID,
  businessId: '0196f000-0000-7000-8000-0000000000a1',
  code: 'C-0901',
  name: 'Sample New Customer',
  nameBn: null,
  kind: 'person',
  isCustomer: true,
  isSupplier: false,
  phone: '+8801700000099',
  altPhone: null,
  email: null,
  address: 'Notun Para, Savar, Dhaka',
  area: 'Savar',
  status: 'active',
  createdAt: '2026-11-25T04:00:00.000Z',
  updatedAt: '2026-11-25T04:00:00.000Z',
  version: 1,
  ...fields,
});
const profile: PartyDetail = {
  ...saved(),
  nidLast4: null,
  creditLimit: null,
  payTermDays: null,
  onCreditHold: false,
  isWalkIn: false,
};

const apiError = (status: number, code: ErrorCode, fields: { path: string; code: string; message: string }[] = []) =>
  new ApiRequestError(status, { code, message: code, fields, requestId: 'test' });

class FakeParty implements IPartyService {
  created: CreatePartyInput[] = [];
  updated: { id: string; input: UpdatePartyInput }[] = [];
  constructor(private readonly refuse: ApiRequestError[] = []) {}
  list = () => Promise.reject(new Error('not used'));
  dues = () => Promise.reject(new Error('not used'));
  get = async (): Promise<PartyDetail> => profile;
  async create(input: CreatePartyInput): Promise<Party> {
    this.created.push(input);
    const refusal = this.refuse.shift();
    if (refusal) throw refusal;
    return saved({ name: input.name });
  }
  async update(id: string, input: UpdatePartyInput): Promise<Party> {
    this.updated.push({ id, input });
    const refusal = this.refuse.shift();
    if (refusal) throw refusal;
    return saved({ version: 2, name: input.name ?? profile.name });
  }
}

function renderForm(party: IPartyService, path: string, locale: 'en' | 'bn' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesContext.Provider value={fakeServices(new FakeHealthService(new Error('unused')), { party })}>
      <QueryClientProvider client={client}>
        <I18nProvider locale={locale}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="customers/new" element={<CustomerFormPage />} />
              <Route path="customers/:id/edit" element={<CustomerFormPage />} />
              <Route path="customers/:id" element={<p>Profile page</p>} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('adding a customer', () => {
  it('sends the typed details as a customer and opens their profile', async () => {
    const party = new FakeParty();
    renderForm(party, '/customers/new');
    await screen.findByRole('heading', { name: 'Add customer' });
    type('Name', 'Sample New Customer');
    type('Phone', '01700000099');
    type('Area', 'Savar');
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(await screen.findByText('Profile page')).toBeInTheDocument();
    expect(party.created).toEqual([
      expect.objectContaining({
        name: 'Sample New Customer',
        phone: '01700000099',
        area: 'Savar',
        kind: 'person',
        isCustomer: true,
        isSupplier: false,
        confirmDuplicate: false,
      }),
    ]);
  });

  it('refuses a phone that is not a Bangladesh mobile before sending anything, naming the field', async () => {
    const party = new FakeParty();
    renderForm(party, '/customers/new');
    await screen.findByRole('heading', { name: 'Add customer' });
    type('Name', 'Sample New Customer');
    type('Phone', '0171234567');
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(await screen.findByText('Enter a mobile number like 01712345678.')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true');
    expect(party.created).toEqual([]);
  });

  it('a phone another customer has lists the match; "Save anyway" sends again with confirmDuplicate', async () => {
    const party = new FakeParty([
      apiError(409, 'CONFLICT', [{ path: 'phone', code: 'party.possible_duplicate', message: 'C-0007 Abdur Rahman' }]),
    ]);
    renderForm(party, '/customers/new');
    await screen.findByRole('heading', { name: 'Add customer' });
    type('Name', 'Sample New Customer');
    type('Phone', '01700000099');
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(await screen.findByText('C-0007 Abdur Rahman')).toBeInTheDocument();
    expect(screen.getByText('A customer with this phone number already exists.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    expect(await screen.findByText('Profile page')).toBeInTheDocument();
    expect(party.created.map((c) => c.confirmDuplicate)).toEqual([false, true]);
  });

  it('a user without permission sees why, and nothing is saved', async () => {
    renderForm(new FakeParty([apiError(403, 'FORBIDDEN')]), '/customers/new');
    await screen.findByRole('heading', { name: 'Add customer' });
    type('Name', 'Sample New Customer');
    type('Phone', '01700000099');
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(await screen.findByText('You do not have permission to add or edit customers.')).toBeInTheDocument();
  });

  it('shows the form in Bangla', async () => {
    renderForm(new FakeParty(), '/customers/new', 'bn');
    expect(await screen.findByRole('heading', { name: 'নতুন গ্রাহক' })).toBeInTheDocument();
    expect(screen.getByLabelText('ফোন')).toBeInTheDocument();
  });
});

describe('editing a customer', () => {
  it('opens with the saved details and sends the changes with the version read', async () => {
    const party = new FakeParty();
    renderForm(party, `/customers/${ID}/edit`);
    expect(await screen.findByRole('heading', { name: 'Edit customer' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Sample New Customer')).toBeInTheDocument();
    type('Name', 'Renamed Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(await screen.findByText('Profile page')).toBeInTheDocument();
    expect(party.updated).toEqual([
      { id: ID, input: expect.objectContaining({ version: 1, name: 'Renamed Customer', confirmDuplicate: false }) },
    ]);
  });

  it('a stale version says someone else changed the customer, and keeps what was typed', async () => {
    const party = new FakeParty([
      apiError(409, 'CONFLICT', [{ path: 'version', code: 'party.version_conflict', message: 'Changed' }]),
    ]);
    renderForm(party, `/customers/${ID}/edit`);
    await screen.findByDisplayValue('Sample New Customer');
    type('Name', 'Renamed Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(
      await screen.findByText('Someone else changed this customer. Reload the page to see their change.'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Renamed Customer')).toBeInTheDocument();
  });
});
