import {
  formatDateTimeBD,
  formatQuantityBD,
  formatTaka,
  type InvoiceDetail,
  type InvoiceSummary,
} from '@erp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useServices } from '../../app/servicesContext';
import { DemoBadge } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import type { PaymentDraft } from '../../services';
import { takaInput } from './cart';
import { canCollect, filterInvoices, paymentProblem, type InvoiceFilter } from './invoices';

const FILTERS: InvoiceFilter[] = ['all', 'paid', 'partly_paid', 'due'];
// The demo POS's methods (Munif, 24 Nov): cash and bKash; ADR 0016 keeps bank and card in the plan.
const METHODS: PaymentDraft['method'][] = ['cash', 'bkash'];
// #221: the pill shows how much is paid (paymentStatus), or Voided for a voided invoice (status).
const STATUS_TONE = {
  paid: 'bg-pos-bg text-pos-text',
  partly_paid: 'bg-warn-bg text-warn-text',
  due: 'bg-neg-bg text-neg-text',
  voided: 'bg-chip text-muted',
};
const pill =
  'min-h-10 rounded-full px-4 text-[13px] text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text';
const card = 'glass flex min-w-0 flex-col gap-3 rounded-3xl p-4';
const kv = 'flex justify-between gap-3 text-[13px]';

/**
 * Sales / POS, the invoices half (design/owner-dashboard/Sales.dc.html): the invoice list with a status filter, and
 * the picked invoice with its items, payments and a payment to collect. Saving a payment carries one
 * Idempotency-Key per attempt, so a retry never collects twice (invariant 5). Print and returns have no backend yet.
 */
export function InvoicesView() {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const taka = (amount: string) => `৳${formatTaka(amount, loc)}`;
  const { sales } = useServices();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['sales', 'invoices'], queryFn: () => sales.invoices() });
  const detail = useQuery({
    queryKey: ['sales', 'invoice', picked],
    queryFn: () => sales.invoice(picked ?? ''),
    enabled: picked !== null,
  });
  const all = list.data ?? [];
  const shown = filterInvoices(all, filter);
  const status = (invoice: InvoiceSummary) => {
    const s = invoice.status === 'voided' ? 'voided' : invoice.paymentStatus;
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[s]}`}>
        {t(`inv.status.${s}` as MessageKey)}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {toast && (
        <p role="status" className="glass pop rounded-2xl px-4 py-3 text-[13px] font-semibold text-pos-text">
          {toast}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section aria-label={t('inv.title')} className={card}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">{t('inv.title')}</h2>
              {list.data && (
                <p className="text-[13px] text-text2">
                  {t('inv.caption', { shown: shown.length, total: all.length })}
                </p>
              )}
            </div>
            <DemoBadge service="sales.invoices" />
          </div>
          <div role="group" aria-label={t('inv.filter.aria')} className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                className={pill}
                onClick={() => setFilter(f)}
              >
                {t(f === 'all' ? 'inv.filter.all' : (`inv.status.${f}` as MessageKey))}
              </button>
            ))}
          </div>
          {list.isPending ? (
            <p role="status" className="text-[13px] text-text2">
              {t('inv.loading')}
            </p>
          ) : list.isError ? (
            <p role="alert" className="text-[13px] text-neg-text">
              {t('inv.loadError')}
            </p>
          ) : shown.length === 0 ? (
            <p className="text-[13px] text-text2">{t(all.length === 0 ? 'inv.none' : 'inv.empty')}</p>
          ) : (
            <ul className="flex flex-col">
              <li
                aria-hidden="true"
                className="hidden grid-cols-[1.2fr_1.4fr_1fr_1fr_auto] gap-x-3 px-2 pb-1 text-xs font-semibold text-muted sm:grid"
              >
                <span>{t('inv.col.invoice')}</span>
                <span>{t('inv.col.customer')}</span>
                <span className="text-right">{t('inv.col.total')}</span>
                <span className="text-right">{t('inv.col.paid')}</span>
                <span className="w-24">{t('inv.col.status')}</span>
              </li>
              {shown.map((invoice) => (
                <li key={invoice.id}>
                  <button
                    type="button"
                    aria-current={picked === invoice.id}
                    onClick={() => setPicked(invoice.id)}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-row-border px-2 py-3 text-left text-[13px] hover:bg-nav-hover aria-[current=true]:bg-nav-active sm:grid-cols-[1.2fr_1.4fr_1fr_1fr_auto]"
                  >
                    <span className="flex flex-col">
                      <b>{invoice.number}</b>
                      <span className="text-xs text-muted">{formatDateTimeBD(invoice.issuedAt, loc)}</span>
                    </span>
                    <span className="hidden truncate sm:block">{invoice.customerName}</span>
                    <span className="num text-right">{taka(invoice.total)}</span>
                    <span className="num hidden text-right text-text2 sm:block">{taka(invoice.paid)}</span>
                    <span className="col-span-2 sm:col-span-1 sm:w-24">{status(invoice)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label={t('inv.details')} className={card}>
          {picked === null ? (
            <div className="flex flex-col gap-1 text-[13px]">
              <b>{t('inv.pick')}</b>
              <span className="text-text2">{t('inv.pickHint')}</span>
            </div>
          ) : detail.isError ? (
            <p role="alert" className="text-[13px] text-neg-text">
              {t('inv.loadError')}
            </p>
          ) : !detail.data ? (
            <p role="status" className="text-[13px] text-text2">
              {t('inv.loading')}
            </p>
          ) : (
            <Details
              invoice={detail.data}
              taka={taka}
              when={formatDateTimeBD(detail.data.issuedAt, loc)}
              status={status(detail.data)}
              onSaved={(updated, amount) => {
                queryClient.setQueryData(['sales', 'invoice', updated.id], updated);
                void queryClient.invalidateQueries({ queryKey: ['sales', 'invoices'] });
                setToast(t('inv.saved', { amount: taka(amount), number: updated.number }));
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Details({
  invoice,
  taka,
  when,
  status,
  onSaved,
}: {
  invoice: InvoiceDetail;
  taka: (amount: string) => string;
  when: string;
  status: React.ReactNode;
  onSaved: (updated: InvoiceDetail, amount: string) => void;
}) {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const { sales } = useServices();
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentDraft['method']>('cash');
  const [reference, setReference] = useState('');
  const [problem, setProblem] = useState<ReturnType<typeof paymentProblem> | 'reference' | 'failed'>(null);
  // One key per payment attempt: the same payment retried keeps its key; a changed one gets a new key.
  const attempt = useRef<{ payment: string; key: string } | null>(null);
  const save = useMutation({
    mutationFn: ({ payment, key }: { payment: PaymentDraft; key: string }) =>
      sales.recordPayment(invoice.id, payment, key),
    onSuccess: (updated, { payment }) => {
      attempt.current = null;
      setAmountText('');
      setReference('');
      setProblem(null);
      onSaved(updated, payment.amount);
    },
    onError: () => setProblem('failed'),
  });
  const onSave = () => {
    const blocked = paymentProblem(amountText, invoice.due);
    if (blocked) return setProblem(blocked);
    // Bank, bKash and card need the external transaction id (ADR 0016 line 20).
    if (method !== 'cash' && reference.trim() === '') return setProblem('reference');
    const payment: PaymentDraft = {
      method,
      amount: takaInput(amountText) ?? '0.00',
      externalRef: method === 'cash' ? null : reference.trim(),
    };
    const text = JSON.stringify([invoice.id, payment]);
    if (attempt.current?.payment !== text) attempt.current = { payment: text, key: crypto.randomUUID() };
    setProblem(null);
    save.mutate({ payment, key: attempt.current.key });
  };
  const collectable = canCollect(invoice);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="num text-lg font-semibold">{invoice.number}</h2>
          <p className="text-[13px] text-text2">{when}</p>
        </div>
        {status}
      </div>
      <div className={kv}>
        <span className="text-text2">{t('inv.customer')}</span>
        <span>{invoice.customerName}</span>
      </div>
      <div className={kv}>
        <span className="text-text2">{t('inv.soldBy')}</span>
        <span>{invoice.soldBy}</span>
      </div>
      <h3 className="border-t border-row-border pt-3 text-xs font-semibold text-muted">{t('inv.items')}</h3>
      {invoice.lines.map((line) => (
        <div key={line.description} className={kv}>
          <span className="flex flex-col">
            <span>{line.description}</span>
            <span className="text-xs text-muted">
              {t('inv.quantity', { quantity: formatQuantityBD(line.quantity, loc) })}
            </span>
          </span>
          <span className="num">{taka(line.amount)}</span>
        </div>
      ))}
      {invoice.discount !== '0.00' && (
        <div className={kv}>
          <span>{t('inv.discount')}</span>
          <span className="num">-{taka(invoice.discount)}</span>
        </div>
      )}
      <div className={`${kv} border-t border-row-border pt-3`}>
        <span>{t('inv.total')}</span>
        <span className="num text-lg font-semibold">{taka(invoice.total)}</span>
      </div>
      <div className={kv}>
        <span>{t('inv.paid')}</span>
        <span className="num">{taka(invoice.paid)}</span>
      </div>
      <div className={kv}>
        <span>{t('inv.balance')}</span>
        <span className={`num font-semibold ${collectable ? 'text-neg-text' : ''}`}>{taka(invoice.due)}</span>
      </div>
      <h3 className="text-xs font-semibold text-muted">{t('inv.payments')}</h3>
      {invoice.payments.length === 0 ? (
        <p className="text-[13px] text-text2">{t('inv.noPayments')}</p>
      ) : (
        invoice.payments.map((p) => (
          <div key={`${p.receivedAt}${p.amount}`} className={kv}>
            <span>
              {formatDateTimeBD(p.receivedAt, loc)}, {t(`pos.method.${p.method}` as MessageKey)}
              {p.externalRef && ` · ${p.externalRef}`}
              <span className="block text-xs text-muted">
                {t('inv.receipt', { number: p.receiptNumber })}
              </span>
            </span>
            <span className="num">{taka(p.amount)}</span>
          </div>
        ))
      )}
      {collectable && (
        <div className="flex flex-col gap-2 border-t border-row-border pt-3">
          <h3 className="text-xs font-semibold text-muted">{t('inv.collect')}</h3>
          <label className="flex flex-col gap-1 text-[13px]">
            {t('inv.amount')}
            <input
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="num min-h-11 rounded-xl border border-row-border bg-chip px-3 text-text"
            />
          </label>
          <div role="group" aria-label={t('inv.method')} className="flex flex-wrap gap-1">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                className={pill}
                onClick={() => setMethod(m)}
              >
                {t(`pos.method.${m}` as MessageKey)}
              </button>
            ))}
          </div>
          {method === 'bkash' && (
            <label className="flex flex-col gap-1 text-[13px]">
              {t('pay.reference')}
              <input
                autoComplete="off"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="min-h-11 rounded-xl border border-row-border bg-chip px-3 text-text"
              />
            </label>
          )}
          {problem && (
            <p role="alert" className="text-[13px] text-neg-text">
              {t(problem === 'reference' ? 'pay.error.reference' : (`inv.error.${problem}` as MessageKey), {
                balance: taka(invoice.due),
              })}
            </p>
          )}
          <button
            type="button"
            disabled={save.isPending}
            onClick={onSave}
            className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
          >
            {t('inv.save')}
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-row-border pt-3">
        {(['inv.print', 'inv.return'] as const).map((key) => (
          <button
            key={key}
            type="button"
            disabled
            title={t('shell.notAvailable')}
            className="min-h-10 rounded-xl border border-row-border px-4 text-[13px] text-text2 disabled:opacity-60"
          >
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );
}
