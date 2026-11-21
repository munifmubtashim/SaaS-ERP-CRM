import { formatMoneyBDT } from '@erp/shared';
import { useI18n } from './context';

/** "৳1,37,500.00", with Bangla digits in Bangla. Formatting only: the amount stays a string. */
export function useTaka() {
  const { locale } = useI18n();
  return (amount: string) => `৳${formatMoneyBDT(amount, locale === 'bn' ? 'bn-BD' : 'en-BD')}`;
}
