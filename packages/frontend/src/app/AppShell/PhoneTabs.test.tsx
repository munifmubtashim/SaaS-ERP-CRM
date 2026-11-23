import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n';
import { PhoneTabs } from './PhoneTabs';

/** The design's phone tab bar: four tabs and More, which opens the full menu. */
function renderTabs(locale: 'en' | 'bn' = 'en') {
  render(
    <MemoryRouter initialEntries={['/sales']}>
      <I18nProvider locale={locale}>
        <PhoneTabs />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('PhoneTabs', () => {
  it('links Home, Sales, Stock and Products, and marks the current one', () => {
    renderTabs();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sales / POS' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Stock' })).toHaveAttribute('href', '/inventory');
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('href', '/products');
  });

  it('More opens the full menu with every design group, and closes it again', () => {
    renderTabs();
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('dialog', { name: 'More' });
    expect(menu).toHaveTextContent('Operations');
    expect(menu).toHaveTextContent('Users and permissions');
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is in Bangla in the Bangla interface', () => {
    renderTabs('bn');
    expect(screen.getByRole('link', { name: 'স্টক' })).toBeInTheDocument();
  });
});
