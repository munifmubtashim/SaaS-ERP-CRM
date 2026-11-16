import { describe, expect, it } from 'vitest';
import { normalizeLogin } from './normalizeLogin';

describe('normalizeLogin', () => {
  it('turns a local 11-digit mobile number into +880 form', () => {
    expect(normalizeLogin(' 01000000000 ')).toBe('+8801000000000');
  });

  it('removes spaces and dashes inside a phone number', () => {
    expect(normalizeLogin('+880 1000-000000')).toBe('+8801000000000');
  });

  it('leaves an email alone apart from trimming and lower case', () => {
    expect(normalizeLogin('  Demo@Example.com ')).toBe('demo@example.com');
  });
});
