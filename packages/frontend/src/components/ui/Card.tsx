import type { HTMLAttributes } from 'react';

/** Glass card from the approved design. */
export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`glass rounded-lg p-6 ${className}`} {...props} />;
}
