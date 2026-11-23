import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { DemoService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { DemoBadge } from './DemoBadge';

/** The design's "Demo data" badge: shown for figures from a sample service, never for real ones. */
function renderBadge(demo: ReadonlySet<DemoService>, locale: 'en' | 'bn' = 'en', compact = false) {
  const services = fakeServices(new FakeHealthService(new Error('unused')), { demo });
  return render(
    <ServicesContext.Provider value={services}>
      <I18nProvider locale={locale}>
        <DemoBadge service="organization" compact={compact} />
      </I18nProvider>
    </ServicesContext.Provider>,
  );
}

describe('DemoBadge', () => {
  it('shows "Demo data" when the service answers with sample data', () => {
    renderBadge(new Set(['organization']));
    expect(screen.getByText('Demo data')).toBeInTheDocument();
  });

  it('shows nothing when the service is real', () => {
    const { container } = renderBadge(new Set());
    expect(container).toBeEmptyDOMElement();
  });

  it('is in Bangla in the Bangla interface', () => {
    renderBadge(new Set(['organization']), 'bn');
    expect(screen.getByText('নমুনা তথ্য')).toBeInTheDocument();
  });

  it('compact: an icon-sized marker, still named "Demo data" for screen readers, with the explanation on hover', () => {
    renderBadge(new Set(['organization']), 'en', true);
    const marker = screen.getByRole('button', { name: 'Demo data' });
    expect(marker).toHaveAttribute('title', 'Demo data: sample figures, not your real records.');
    expect(marker).toHaveAttribute('aria-expanded', 'false');
  });

  it('compact: a tap shows the explanation as text (touch has no hover), and another tap hides it', () => {
    renderBadge(new Set(['organization']), 'en', true);
    const marker = screen.getByRole('button', { name: 'Demo data' });
    fireEvent.click(marker);
    expect(marker).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Demo data: sample figures, not your real records.',
    );
    fireEvent.click(marker);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('compact: nothing for real data, and Bangla in the Bangla interface', () => {
    const { container, unmount } = renderBadge(new Set(), 'en', true);
    expect(container).toBeEmptyDOMElement();
    unmount();
    renderBadge(new Set(['organization']), 'bn', true);
    expect(screen.getByRole('button', { name: 'নমুনা তথ্য' })).toBeInTheDocument();
  });
});
