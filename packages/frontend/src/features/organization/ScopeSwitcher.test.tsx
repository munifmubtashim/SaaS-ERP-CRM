import type { MyBusinessesResponse } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { IOrganizationService } from '../../services';
import { activeScopeStore } from '../../store/activeScopeStore';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { ScopeSwitcher } from './ScopeSwitcher';

const id = (n: number) => `0196f000-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;
const businesses: MyBusinessesResponse = {
  items: [
    {
      id: id(10),
      name: 'Demo Motors',
      branches: [
        { id: id(11), name: 'Demo Branch North' },
        { id: id(12), name: 'Demo Branch South' },
      ],
    },
    {
      id: id(20),
      name: 'Sample Traders',
      branches: [
        { id: id(21), name: 'Sample Branch East' },
        { id: id(22), name: 'Sample Branch West' },
      ],
    },
  ],
};

class FakeOrganizationService implements IOrganizationService {
  calls = 0;
  constructor(private readonly answer: MyBusinessesResponse | Error | 'pending') {}
  myBusinesses(): Promise<MyBusinessesResponse> {
    this.calls += 1;
    if (this.answer === 'pending') return new Promise(() => {});
    return this.answer instanceof Error ? Promise.reject(this.answer) : Promise.resolve(this.answer);
  }
}

function renderSwitcher(organization: IOrganizationService, locale: 'en' | 'bn' = 'en') {
  const services = fakeServices(new FakeHealthService(new Error('unused')), { organization });
  render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <ScopeSwitcher />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

afterEach(() => activeScopeStore.clear());

describe('ScopeSwitcher', () => {
  it('starts on the first business and its first branch, and shows both', async () => {
    renderSwitcher(new FakeOrganizationService(businesses));
    expect(await screen.findByLabelText('Business')).toHaveDisplayValue('Demo Motors');
    expect(screen.getByLabelText('Branch')).toHaveDisplayValue('Demo Branch North');
    expect(activeScopeStore.get()).toEqual({ businessId: id(10), branchId: id(11) });
  });

  it('switching business moves to that business’s first branch and remembers it', async () => {
    renderSwitcher(new FakeOrganizationService(businesses));
    fireEvent.change(await screen.findByLabelText('Business'), { target: { value: id(20) } });
    expect(screen.getByLabelText('Branch')).toHaveDisplayValue('Sample Branch East');
    expect(activeScopeStore.get()).toEqual({ businessId: id(20), branchId: id(21) });
  });

  it('switching branch keeps the business', async () => {
    renderSwitcher(new FakeOrganizationService(businesses));
    fireEvent.change(await screen.findByLabelText('Branch'), { target: { value: id(12) } });
    expect(activeScopeStore.get()).toEqual({ businessId: id(10), branchId: id(12) });
  });

  it('keeps a remembered choice that is still allowed', async () => {
    activeScopeStore.set({ businessId: id(20), branchId: id(22) });
    renderSwitcher(new FakeOrganizationService(businesses));
    expect(await screen.findByLabelText('Branch')).toHaveDisplayValue('Sample Branch West');
  });

  it('drops a remembered choice the user may no longer use', async () => {
    activeScopeStore.set({ businessId: id(99), branchId: id(98) });
    renderSwitcher(new FakeOrganizationService(businesses));
    expect(await screen.findByLabelText('Business')).toHaveDisplayValue('Demo Motors');
    expect(activeScopeStore.get()).toEqual({ businessId: id(10), branchId: id(11) });
  });

  it('shows a loading state', () => {
    renderSwitcher(new FakeOrganizationService('pending'));
    expect(screen.getByText('Loading businesses…')).toBeInTheDocument();
  });

  it('shows an error with a retry that asks again', async () => {
    const organization = new FakeOrganizationService(new TypeError('Failed to fetch'));
    renderSwitcher(organization);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your businesses.');
    await screen.findByRole('button', { name: 'Try again' });
    expect(organization.calls).toBe(2);
  });

  it('says so when the user has no business yet', async () => {
    renderSwitcher(new FakeOrganizationService({ items: [] }));
    expect(await screen.findByText('No business is assigned to you yet.')).toBeInTheDocument();
    expect(activeScopeStore.get()).toBeNull();
  });

  it('renders in Bangla', async () => {
    renderSwitcher(new FakeOrganizationService(businesses), 'bn');
    expect(await screen.findByLabelText('ব্যবসা')).toBeInTheDocument();
    expect(screen.getByLabelText('শাখা')).toBeInTheDocument();
  });
});
