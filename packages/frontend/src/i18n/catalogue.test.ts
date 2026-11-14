import { describe, expect, it } from 'vitest';
import { catalogues, createTranslator } from './index';

describe('message catalogues', () => {
  it('bn has exactly the same keys as en', () => {
    expect(Object.keys(catalogues.bn).sort()).toEqual(Object.keys(catalogues.en).sort());
  });

  it('has no empty strings in any locale', () => {
    for (const catalogue of Object.values(catalogues)) {
      for (const value of Object.values(catalogue)) expect(value.trim()).not.toBe('');
    }
  });

  it('translates into Bangla', () => {
    expect(createTranslator('bn')('shell.nav.home')).toBe('হোম');
  });
});
