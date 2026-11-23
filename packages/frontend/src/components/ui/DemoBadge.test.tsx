import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { DemoService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { DemoBadge } from './DemoBadge';

/** The design's "Demo data" badge: shown for figures from a sample service, never for real ones. */
function renderBadge(demo: ReadonlySet<DemoService>, locale: 'en' | 'bn' = 'en') {
  const services = fakeServices(new FakeHealthService(new Error('unused')), { demo });
  return render(
    <ServicesContext.Provider value={services}>
      <I18nProvider locale={locale}>
        <DemoBadge service="organization" />
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
});
