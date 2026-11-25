/**
 * Phone numbers to E.164 (ADR 0019 section 4), shared so the form and the API agree. Spaces, hyphens, dots and
 * brackets are ignored. A Bangladesh mobile may be typed as 01XXXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX and must
 * use an operator prefix 013 to 019. Any other country needs a + and its country code. Returns null when the
 * number is neither.
 */
const BD_MOBILE = /^(?:\+?88)?(01[3-9]\d{8})$/;
const BD_COUNTRY = /^\+?880/;
const OTHER = /^\+[1-9]\d{6,14}$/;

export function toE164(raw: string): string | null {
  const text = raw.replace(/[\s\-.()]/g, '');
  const mobile = BD_MOBILE.exec(text);
  if (mobile) return `+88${mobile[1]}`;
  // A +880 number that isn't a mobile (a landline, a wrong length) is refused, not passed on as "another country".
  if (BD_COUNTRY.test(text)) return null;
  return OTHER.test(text) ? text : null;
}
