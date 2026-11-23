/**
 * What people type into "Phone or email" becomes the form the API expects: an email in lower case, or a
 * phone in +880 form. A local 11-digit mobile number (01…) gets the +88 prefix.
 */
export function normalizeLogin(raw: string): string {
  const value = raw.trim();
  if (value.includes('@')) return value.toLowerCase();
  const digits = value.replace(/[\s-]/g, '');
  return /^01\d{9}$/.test(digits) ? `+88${digits}` : digits;
}
