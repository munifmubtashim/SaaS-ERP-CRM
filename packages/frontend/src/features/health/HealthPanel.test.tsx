import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { HealthPanel } from './HealthPanel';

function renderPanel(locale: 'en' | 'bn' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale={locale}>
        <HealthPanel />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const mockFetch = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

afterEach(() => vi.unstubAllGlobals());

const healthy = {
  status: 'ok',
  version: '0.0.0-dev',
  time: '2026-11-14T06:00:00.000Z',
  checks: { database: 'ok' },
};

describe('HealthPanel (healthService -> GET /api/health)', () => {
  it('calls /api/health and shows API and database as working', async () => {
    mockFetch(200, healthy);
    renderPanel();
    expect(await screen.findAllByText('Working')).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('shows the database as not reachable when the API answers 503', async () => {
    mockFetch(503, { ...healthy, status: 'degraded', checks: { database: 'down' } });
    renderPanel();
    expect(await screen.findByText('Not reachable')).toBeInTheDocument();
  });

  it('shows an error with a retry button when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderPanel();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders in Bangla', async () => {
    mockFetch(200, healthy);
    renderPanel('bn');
    expect(await screen.findAllByText('চালু আছে')).toHaveLength(2);
  });
});
