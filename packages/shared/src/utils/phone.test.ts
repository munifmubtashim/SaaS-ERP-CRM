import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toE164 } from './phone.js';

/** ADR 0019 section 4 and test 14 (ADR 0006 test 1): one normaliser, shared by the form and the API. */
describe('toE164', () => {
  it.each(['01712345678', '8801712345678', '+8801712345678', '017 1234-5678', ' +880 1712 345678 '])(
    'reads the Bangladesh mobile %j as +8801712345678',
    (raw) => {
      expect(toE164(raw)).toBe('+8801712345678');
    },
  );

  it.each(['01312345678', '01412345678', '01512345678', '01612345678', '01812345678', '01912345678'])(
    'accepts every mobile operator prefix 013 to 019: %s',
    (raw) => {
      expect(toE164(raw)).toBe(`+88${raw}`);
    },
  );

  it.each([
    ['one digit short', '0171234567'],
    ['one digit long', '017123456789'],
    ['operator 012, which is not a mobile prefix', '01212345678'],
    ['a Dhaka landline', '+88029876543'],
    ['letters', '0171234567a'],
    ['empty', ''],
    ['a local number without the leading 0', '1712345678'],
  ])('refuses %s (%j)', (_name, raw) => {
    expect(toE164(raw)).toBeNull();
  });

  it('keeps another country with a + and its country code, and refuses one without the +', () => {
    expect(toE164('+44 20 7946 0958')).toBe('+442079460958');
    expect(toE164('442079460958')).toBeNull();
    expect(toE164('+0123456789')).toBeNull();
  });

  it('every number it returns is valid E.164, the form the party schema stores', () => {
    for (const raw of ['01712345678', '+44 20 7946 0958', '+8801912345678']) {
      expect(z.e164().safeParse(toE164(raw)).success).toBe(true);
    }
  });
});
