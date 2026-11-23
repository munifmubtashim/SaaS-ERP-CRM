import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { applyBrandIcon, readBrand } from './brand';
import { BrandLogo } from './BrandLogo';

/**
 * Local branding: a business's own logo, shown only when this machine's start-up settings name it. Nothing about a
 * real business is in the code; without the settings the app keeps its plain name.
 */
describe('readBrand', () => {
  it('is off unless both the name and the folder are set', () => {
    expect(readBrand({})).toBeNull();
    expect(readBrand({ VITE_BRAND_NAME: 'Sample Brand' })).toBeNull();
    expect(readBrand({ VITE_BRAND_DIR: '/brand/local' })).toBeNull();
    expect(readBrand({ VITE_BRAND_NAME: '  ', VITE_BRAND_DIR: '/brand/local' })).toBeNull();
  });

  it('builds the logo, mark and icon paths from the folder', () => {
    expect(readBrand({ VITE_BRAND_NAME: ' Sample Brand ', VITE_BRAND_DIR: '/brand/local/' })).toEqual({
      name: 'Sample Brand',
      logo: '/brand/local/logo.png',
      mark: '/brand/local/mark.png',
      icon: '/brand/local/icon.png',
      touchIcon: '/brand/local/icon-180.png',
    });
  });

  it('only reads from the app’s own /brand/ folder, never another site', () => {
    expect(readBrand({ VITE_BRAND_NAME: 'X', VITE_BRAND_DIR: 'https://example.com/brand' })).toBeNull();
    expect(readBrand({ VITE_BRAND_NAME: 'X', VITE_BRAND_DIR: '/assets' })).toBeNull();
    expect(readBrand({ VITE_BRAND_NAME: 'X', VITE_BRAND_DIR: '/brand/../x' })).toBeNull();
  });
});

const brand = readBrand({ VITE_BRAND_NAME: 'Sample Brand', VITE_BRAND_DIR: '/brand/local' });

describe('BrandLogo', () => {
  it('shows the logo, named by the brand', () => {
    render(<BrandLogo brand={brand} fallback="ERP" />);
    expect(screen.getByRole('img', { name: 'Sample Brand' })).toHaveAttribute('src', '/brand/local/logo.png');
  });

  it('the mark variant shows the mark', () => {
    render(<BrandLogo brand={brand} variant="mark" fallback="ERP" />);
    expect(screen.getByRole('img', { name: 'Sample Brand' })).toHaveAttribute('src', '/brand/local/mark.png');
  });

  it('shows the plain name when there is no brand, or when the image is missing', () => {
    const { unmount } = render(<BrandLogo brand={null} fallback="ERP" />);
    expect(screen.getByText('ERP')).toBeInTheDocument();
    unmount();
    render(<BrandLogo brand={brand} fallback="ERP" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('ERP')).toBeInTheDocument();
  });
});

describe('applyBrandIcon', () => {
  it('sets the tab icon, the home-screen icon and the title', () => {
    applyBrandIcon(brand, document);
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute('href', '/brand/local/icon.png');
    expect(document.querySelector('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/brand/local/icon-180.png',
    );
    expect(document.title).toBe('Sample Brand');
  });

  it('changes nothing without a brand', () => {
    document.title = 'ERP';
    applyBrandIcon(null, document);
    expect(document.title).toBe('ERP');
  });
});
