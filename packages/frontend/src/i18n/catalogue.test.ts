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

  it('fills named placeholders, in both languages, and leaves a string without them alone', () => {
    expect(createTranslator('en')('customers.noMatch', { search: 'karim' })).toBe(
      'No customer matches “karim”.',
    );
    expect(createTranslator('bn')('customers.noMatch', { search: 'karim' })).toContain('“karim”');
    expect(createTranslator('en')('customers.noMatchStatus', { search: 'x' })).toBe(
      'No customers with this status.',
    );
  });

  it('translates into Bangla', () => {
    expect(createTranslator('bn')('shell.nav.home')).toBe('হোম');
  });
});
