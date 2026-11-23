import { useState, type ReactNode } from 'react';
import { BRAND, type Brand } from './brand';

/**
 * The business's logo (`full`) or its mark alone (`mark`), named by the business. Shows `fallback` (the plain app
 * name) when there is no local brand or its image is missing, so a build without the files still reads correctly.
 */
export function BrandLogo({
  brand = BRAND,
  variant = 'full',
  fallback,
  className = '',
}: {
  brand?: Brand | null;
  variant?: 'full' | 'mark';
  fallback: ReactNode;
  className?: string;
}) {
  const [missing, setMissing] = useState(false);
  if (!brand || missing) return <>{fallback}</>;
  return (
    <img
      src={variant === 'full' ? brand.logo : brand.mark}
      alt={brand.name}
      className={`block w-auto object-contain ${className}`}
      onError={() => setMissing(true)}
    />
  );
}
