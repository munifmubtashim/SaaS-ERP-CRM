import { useState, type ReactNode } from 'react';
import { BRAND, type Brand } from './brand';

/**
 * The business's logo (`full`), the logo without its tagline (`wordmark`, for small spaces) or its mark alone
 * (`mark`), named by the business. A missing wordmark falls back to the full logo; when there is no local brand or
 * no image loads, `fallback` (the plain app name) shows, so a build without the files still reads correctly.
 */
export function BrandLogo({
  brand = BRAND,
  variant = 'full',
  fallback,
  className = '',
}: {
  brand?: Brand | null;
  variant?: 'full' | 'wordmark' | 'mark';
  fallback: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(0);
  if (!brand) return <>{fallback}</>;
  const sources =
    variant === 'wordmark' ? [brand.wordmark, brand.logo] : [variant === 'full' ? brand.logo : brand.mark];
  const src = sources[failed];
  if (!src) return <>{fallback}</>;
  return (
    <img
      key={src}
      src={src}
      alt={brand.name}
      className={`block w-auto object-contain ${className}`}
      onError={() => setFailed((n) => n + 1)}
    />
  );
}
