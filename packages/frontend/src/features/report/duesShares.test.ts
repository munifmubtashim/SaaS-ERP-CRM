import { describe, expect, it } from 'vitest';
import { byDuesWithShare } from './duesShares';

const row = (businessId: string, dues: string) => ({
  businessId,
  name: businessId,
  dues,
  collectionsToday: '0.00',
});

describe('byDuesWithShare', () => {
  it('orders businesses by dues, largest first', () => {
    const rows = byDuesWithShare([row('a', '387250.00'), row('b', '1234567.50'), row('c', '0.00')]);
    expect(rows.map((r) => r.businessId)).toEqual(['b', 'a', 'c']);
  });

  it('gives each business its share of all dues as a two-decimal percent string, summing to exactly 100', () => {
    const rows = byDuesWithShare([row('a', '1234567.50'), row('b', '387250.00')]);
    expect(rows.map((r) => r.share)).toEqual(['76.12', '23.88']);
  });

  it('splits three equal dues so the shares still add up to 100.00', () => {
    const shares = byDuesWithShare([row('a', '100.00'), row('b', '100.00'), row('c', '100.00')]).map(
      (r) => r.share,
    );
    expect(shares).toEqual(['33.34', '33.33', '33.33']);
  });

  it('shows no shares when nobody owes anything', () => {
    expect(byDuesWithShare([row('a', '0.00'), row('b', '0.00')]).map((r) => r.share)).toEqual([null, null]);
  });

  it('shows no shares when a business has customers in credit (negative dues): a share would mislead', () => {
    const rows = byDuesWithShare([row('a', '5000.00'), row('b', '-250.00')]);
    expect(rows.map((r) => r.share)).toEqual([null, null]);
    expect(rows.map((r) => r.businessId)).toEqual(['a', 'b']);
  });

  it('keeps every digit of a 16-digit amount', () => {
    const rows = byDuesWithShare([row('a', '9999999999999999.99'), row('b', '0.01')]);
    expect(rows.map((r) => r.share)).toEqual(['100.00', '0.00']);
  });
});
