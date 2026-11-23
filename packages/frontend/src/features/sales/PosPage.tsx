import { formatTaka, type InvoiceSummary, type PosItem } from '@erp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useServices } from '../../app/servicesContext';
import { DemoBadge } from '../../components/ui';
import { useI18n } from '../../i18n';
import {
  addItem,
  cartTotals,
  categoriesOf,
  changeQuantity,
  filterItems,
  pickSerial,
  removeLine,
  saleProblem,
  takaInput,
  toSaleDraft,
  type Cart,
  type PaymentChoice,
} from './cart';

const METHODS: PaymentChoice[] = ['cash', 'card', 'bkash', 'due'];
const pill =
  'min-h-10 rounded-full px-4 text-[13px] text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text';
const field = 'min-h-11 w-full rounded-xl border border-row-border bg-chip px-3 text-text';

/**
 * Sales / POS, the selling half (design/owner-dashboard/Sales.dc.html): the product list and the current sale.
 * Complete sale sends one draft with one Idempotency-Key per draft, so a retry can never sell twice (invariant 5).
 * Owner: Farhan (Sales). Invoices are the next PR.
 */
export function PosPage() {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const taka = (amount: string) => `৳${formatTaka(amount, loc)}`;
  const { sales } = useServices();
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: ['sales', 'posItems'], queryFn: () => sales.posItems() });

  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Cart>([]);
  const [customer, setCustomer] = useState('');
  const [discountText, setDiscountText] = useState('');
  const [receivedText, setReceivedText] = useState('');
  const [method, setMethod] = useState<PaymentChoice>('cash');
  const [problem, setProblem] = useState<'empty' | 'serial_missing' | 'failed' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // One key per draft: the same draft retried keeps its key; a changed draft gets a new one.
  const attempt = useRef<{ draft: string; key: string } | null>(null);

  const payment = {
    discount: takaInput(discountText) ?? '0.00',
    method,
    received: receivedText.trim() === '' ? null : (takaInput(receivedText) ?? '0.00'),
  };
  const totals = cartTotals(cart, payment);

  const complete = useMutation({
    mutationFn: ({ draft, key }: { draft: ReturnType<typeof toSaleDraft>; key: string }) =>
      sales.completeSale(draft, key),
    onSuccess: (invoice: InvoiceSummary) => {
      attempt.current = null;
      setToast(
        totals.due
          ? t('pos.savedDue', { number: invoice.number, paid: taka(invoice.paid), due: taka(totals.due) })
          : t('pos.saved', { number: invoice.number, paid: taka(invoice.paid) }),
      );
      setCart([]);
      setCustomer('');
      setDiscountText('');
      setReceivedText('');
      setMethod('cash');
      setProblem(null);
      void queryClient.invalidateQueries({ queryKey: ['sales', 'posItems'] });
    },
    onError: () => setProblem('failed'),
  });

  const onComplete = () => {
    const blocked = saleProblem(cart);
    if (blocked) return setProblem(blocked);
    const draft = toSaleDraft(cart, customer.trim() || null, payment);
    const text = JSON.stringify(draft);
    if (attempt.current?.draft !== text) attempt.current = { draft: text, key: crypto.randomUUID() };
    setProblem(null);
    complete.mutate({ draft, key: attempt.current.key });
  };

  const list = items.data ?? [];
  const shown = filterItems(list, search, category);
  const byId = (id: string): PosItem | undefined => list.find((i) => i.id === id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="num text-[28px] font-bold">{t('shell.nav.sales')}</h1>
      {toast && (
        <p role="status" className="glass pop rounded-2xl px-4 py-3 text-[13px] font-semibold text-pos-text">
          {toast}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section aria-label={t('pos.products')} className="glass flex min-w-0 flex-col gap-3 rounded-3xl p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t('pos.products')}</h2>
            <DemoBadge service="sales" />
          </div>
          <input
            type="search"
            aria-label={t('pos.search')}
            placeholder={t('pos.search')}
            className={field}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {categoriesOf(list).map((c) => (
              <button
                key={c}
                type="button"
                className={pill}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c === 'all' ? t('pos.all') : c}
              </button>
            ))}
          </div>
          {items.isPending ? (
            <p className="text-[13px] text-muted">{t('pos.loading')}</p>
          ) : items.isError ? (
            <div role="alert" className="text-[13px] text-neg-text">
              {t('pos.loadError')}{' '}
              <button type="button" className="font-semibold underline" onClick={() => void items.refetch()}>
                {t('dash.card.retry')}
              </button>
            </div>
          ) : shown.length === 0 ? (
            <p className="text-[13px] text-text2">{t('pos.noMatch')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1">{t('pos.item')}</th>
                    <th className="hidden py-1 sm:table-cell">{t('pos.category')}</th>
                    <th className="py-1">{t('pos.stock')}</th>
                    <th className="py-1 text-right">{t('pos.price')}</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((item) => {
                    const none = Number(item.available) < 1;
                    return (
                      <tr key={item.id} className="border-t border-row-border">
                        <td className="py-2 font-semibold">{item.name}</td>
                        <td className="hidden py-2 text-text2 sm:table-cell">{item.category}</td>
                        <td className={`py-2 ${none ? 'text-neg-text' : 'text-text2'}`}>
                          {none ? t('pos.noneLeft') : t('pos.inStock', { count: Number(item.available) })}
                        </td>
                        <td className="num py-2 text-right">{taka(item.price)}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            disabled={none}
                            aria-label={t('pos.add', { name: item.name })}
                            className="min-h-10 rounded-full bg-accent-soft px-4 font-semibold text-accent-text disabled:opacity-50"
                            onClick={() => setCart((c) => addItem(c, item))}
                          >
                            {t('pos.addShort')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-label={t('pos.sale')} className="glass flex min-w-0 flex-col gap-3 rounded-3xl p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t('pos.sale')}</h2>
            {cart.length > 0 && (
              <button type="button" className="text-[13px] text-text2 underline" onClick={() => setCart([])}>
                {t('pos.clear')}
              </button>
            )}
          </div>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t('pos.customer')}
            <input
              className={field}
              placeholder={t('pos.walkIn')}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </label>
          {cart.length === 0 ? (
            <div className="text-[13px] text-text2">
              <p className="font-semibold text-text">{t('pos.empty')}</p>
              <p>{t('pos.emptyHint')}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2 text-[13px]">
              {cart.map((line, index) => {
                const taken = cart.filter((_, i) => i !== index).map((other) => other.serialNumber);
                return (
                  <li
                    key={`${line.itemId}-${index}`}
                    className="flex flex-col gap-1 border-t border-row-border pt-2"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">{line.name}</span>
                      <span className="num">{`${line.quantity} × ${taka(line.unitPrice)}`}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {line.kind === 'serial' ? (
                        <label className="flex items-center gap-2 text-muted">
                          {t('pos.chassis')}
                          <select
                            className="min-h-10 rounded-xl border border-row-border bg-chip px-2 text-text"
                            value={line.serialNumber ?? ''}
                            onChange={(e) => setCart((c) => pickSerial(c, index, e.target.value))}
                          >
                            <option value="">{t('pos.pick')}</option>
                            {(byId(line.itemId)?.serialNumbers ?? [])
                              .filter((s) => !taken.includes(s))
                              .map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                          </select>
                        </label>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="size-10 rounded-full border border-row-border"
                            aria-label={t('pos.fewer', { name: line.name })}
                            onClick={() => setCart((c) => changeQuantity(c, index, -1))}
                          >
                            −
                          </button>
                          <button
                            type="button"
                            className="size-10 rounded-full border border-row-border"
                            aria-label={t('pos.more', { name: line.name })}
                            onClick={() => setCart((c) => changeQuantity(c, index, +1))}
                          >
                            +
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="ml-auto text-text2 underline"
                        aria-label={t('pos.remove', { name: line.name })}
                        onClick={() => setCart((c) => removeLine(c, index))}
                      >
                        {t('pos.removeShort')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <dl className="flex flex-col gap-1 border-t border-row-border pt-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-text2">{t('pos.subtotal')}</dt>
              <dd className="num" data-testid="subtotal">
                {taka(totals.subtotal)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-text2">{t('pos.discount')}</dt>
              <dd>
                <input
                  aria-label={t('pos.discountAria')}
                  inputMode="decimal"
                  className="min-h-10 w-32 rounded-xl border border-row-border bg-chip px-2 text-right"
                  value={discountText}
                  onChange={(e) => setDiscountText(e.target.value)}
                />
              </dd>
            </div>
            <div className="flex justify-between text-base font-bold">
              <dt>{t('pos.total')}</dt>
              <dd className="num" data-testid="total">
                {taka(totals.total)}
              </dd>
            </div>
          </dl>
          <div role="group" aria-label={t('pos.payment')} className="flex flex-wrap gap-1">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                className={pill}
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
              >
                {t(`pos.method.${m}` as 'pos.method.cash')}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t('pos.received')}
            <input
              aria-label={t('pos.receivedAria')}
              inputMode="decimal"
              disabled={method === 'due'}
              className={`${field} text-right disabled:opacity-60`}
              placeholder={formatTaka(totals.total, loc)}
              value={method === 'due' ? '' : receivedText}
              onChange={(e) => setReceivedText(e.target.value)}
            />
          </label>
          {(totals.change || totals.due) && (
            <p className="flex justify-between text-[13px] font-semibold">
              <span>{totals.change ? t('pos.change') : t('pos.stillDue')}</span>
              <span className="num">{taka(totals.change ?? totals.due ?? '0.00')}</span>
            </p>
          )}
          {problem && (
            <p role="alert" className="text-[13px] text-neg-text">
              {t(
                problem === 'empty'
                  ? 'pos.error.empty'
                  : problem === 'serial_missing'
                    ? 'pos.error.chassis'
                    : 'pos.error.failed',
              )}
            </p>
          )}
          <button
            type="button"
            disabled={complete.isPending}
            className="min-h-12 rounded-full bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
            onClick={onComplete}
          >
            {t('pos.complete', { total: taka(totals.total) })}
          </button>
          <p className="text-xs text-muted">{t('pos.note')}</p>
        </section>
      </div>
    </div>
  );
}
