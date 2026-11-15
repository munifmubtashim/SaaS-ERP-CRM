import type { HealthResponse } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { IHealthService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { HealthPanel } from './HealthPanel';

function renderPanel(health: IHealthService, locale: 'en' | 'bn' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesContext.Provider value={fakeServices(health)}>
      <QueryClientProvider client={client}>
        <I18nProvider locale={locale}>
          <HealthPanel />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const healthy: HealthResponse = {
  status: 'ok',
  version: '0.0.0-dev',
  time: '2026-11-14T06:00:00.000Z',
  checks: { database: 'ok' },
};

describe('HealthPanel with an injected fake IHealthService', () => {
  it('shows API and database as working', async () => {
    renderPanel(new FakeHealthService(healthy));
    expect(await screen.findAllByText('Working')).toHaveLength(2);
  });

  it('shows the database as not reachable when the service reports it down', async () => {
    renderPanel(new FakeHealthService({ ...healthy, status: 'degraded', checks: { database: 'down' } }));
    expect(await screen.findByText('Not reachable')).toBeInTheDocument();
  });

  it('shows an error with a retry button when the API cannot be reached', async () => {
    renderPanel(new FakeHealthService(new TypeError('Failed to fetch')));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders in Bangla', async () => {
    renderPanel(new FakeHealthService(healthy), 'bn');
    expect(await screen.findAllByText('চালু আছে')).toHaveLength(2);
  });
});
