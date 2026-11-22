import { Button } from '../../components/ui';
import { useI18n } from '../../i18n';
import { selectBranch, selectBusiness, useMyBusinesses } from './useMyBusinesses';

const select =
  'min-h-10 max-w-48 truncate rounded-full border border-row-border bg-chip px-3 font-semibold text-text hover:border-accent';

/**
 * Header control: which business and branch am I working in? Always visible (spec O-04); switching business
 * moves to its first branch.
 */
export function ScopeSwitcher() {
  const { t } = useI18n();
  const { query, business, branch } = useMyBusinesses();

  if (query.isPending) return <p className="text-[13px] text-muted">{t('scope.loading')}</p>;

  if (query.isError) {
    return (
      <div role="alert" className="flex items-center gap-2 text-[13px] text-neg-text">
        {t('scope.error')}
        <Button onClick={() => void query.refetch()}>{t('scope.retry')}</Button>
      </div>
    );
  }

  const items = query.data.items;
  if (items.length === 0) return <p className="text-[13px] text-muted">{t('scope.none')}</p>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-[13px] text-muted">
        {t('scope.business')}
        <select
          className={select}
          value={business?.id ?? ''}
          onChange={(e) => {
            const next = items.find((b) => b.id === e.target.value);
            if (next) selectBusiness(next);
          }}
        >
          {items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[13px] text-muted">
        {t('scope.branch')}
        <select
          className={select}
          value={branch?.id ?? ''}
          onChange={(e) => business && selectBranch(business.id, e.target.value)}
        >
          {business?.branches.map((br) => (
            <option key={br.id} value={br.id}>
              {br.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
