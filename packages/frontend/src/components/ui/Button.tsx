import type { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'primary';

/** Design-system button. 44 px minimum touch target (roadmap 7.1). */
export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const look =
    variant === 'primary'
      ? 'bg-accent text-on-accent border-transparent hover:brightness-110'
      : 'bg-chip text-text border-card-border hover:border-accent';
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center rounded-md border px-4 font-semibold transition-colors ${look} ${className}`}
      {...props}
    />
  );
}
