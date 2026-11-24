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

  it('fills {placeholders} from params, and leaves an unknown one as written', () => {
    const t = createTranslator('en');
    expect(t('dash.greeting.morning', { name: 'Sample Owner' })).toBe('Good morning, Sample Owner');
    expect(t('dash.greeting.morning')).toBe('Good morning, {name}');
    expect(t('dash.greeting.morning', { other: 'x' })).toBe('Good morning, {name}');
  });

  it('every placeholder in en is also in bn, so a Bangla sentence never drops a figure', () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, text] of Object.entries(catalogues.en)) {
      expect(names(catalogues.bn[key as keyof typeof catalogues.en]), key).toEqual(names(text));
    }
  });

  it('in Bangla, number params are written with Bangla digits', () => {
    expect(createTranslator('bn')('dash.fc.weeks', { count: 13 })).toBe('১৩ সপ্তাহ');
    expect(createTranslator('en')('dash.fc.weeks', { count: 13 })).toBe('13 weeks');
  });
});
