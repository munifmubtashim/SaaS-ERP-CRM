import type { CustomerDues, PartyDetail, PaymentMethod, RecordPaymentInput } from '@erp/shared';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { Button, Card, DemoBadge } from '../../components/ui';
import { useI18n, useTaka } from '../../i18n';
import { ApiRequestError } from '../../services';
import { paymentRefusalOf } from './paymentRefusal';
import { useActiveBusinessId } from '../../store/activeBusinessStore';
import { useCustomerDues, useCustomerProfile } from '../party/useCustomerDetail';
import { toPaymentInput, useRecordPayment, type PaymentFormValues } from './useRecordPayment';

const METHODS: PaymentMethod[] = ['cash', 'bank', 'bkash', 'card'];
const input =
  'block min-h-11 w-full rounded-md border border-card-border bg-chip px-3 text-text focus:border-accent';

/** Fills "{name}"-style slots in a translated sentence. */
const fill = (text: string, values: Record<string, string>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, v), text);

/**
 * Record a customer payment (A15 screen, on mocks). Question: how much did this customer pay, and how?
 * Next action: record it, after a confirm step that names what will be recorded. No date field: the server
 * sets the business date. Keyed by the active business, like the profile (ADR 0007).
 */

export function RecordPaymentPage() {
  const businessId = useActiveBusinessId();
  const { id = '' } = useParams();
  return <RecordPayment key={`${businessId}:${id}`} id={id} />;
}

function RecordPayment({ id }: { id: string }) {
  const { t } = useI18n();
  const taka = useTaka();
  const profile = useCustomerProfile(id);
  const dues = useCustomerDues(id);

  if (profile.isPending || (profile.isSuccess && dues.isPending)) {
    return (
      <p aria-busy="true" className="text-muted">
        {t('customer.loading')}
      </p>
    );
  }
  const failed = profile.isError ? profile : dues.isError ? dues : null;
  if (failed) {
    const status = failed.error instanceof ApiRequestError ? failed.error.status : undefined;
    if (status === 404) {
      return (
        <div className="space-y-4">
          <p>{t('customer.notFound')}</p>
          <Link to="/customers" className="font-medium text-accent-text">
            {t('customer.back')}
          </Link>
        </div>
      );
    }
    if (status === 403) return <p className="text-muted">{t('customer.forbidden')}</p>;
    return (
      <div role="alert" className="space-y-4">
        <p>{t('customer.error')}</p>
        <Button onClick={() => void failed.refetch()}>{t('customer.retry')}</Button>
      </div>
    );
  }
  if (!profile.data || !dues.data) return null;

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{t('payment.title')}</h1>
        <DemoBadge service="sales.payments" />
      </div>
      <p className="mt-1">{profile.data.name}</p>
      <p className="text-[13px] text-muted">
        {t('customer.dues.total')} <span className="num">{taka(dues.data.totalDue)}</span>
      </p>
      <Card className="mt-6">
        <PaymentFlow customer={profile.data} dues={dues.data} />
      </Card>
    </div>
  );
}

function PaymentFlow({ customer, dues }: { customer: PartyDetail; dues: CustomerDues }) {
  const { t } = useI18n();
  const taka = useTaka();
  const record = useRecordPayment(customer.id);
  // Set on "Continue"; the key stays the same for every retry of this one payment.
  const [pending, setPending] = useState<{ input: RecordPaymentInput; key: string } | null>(null);
  const form = useForm<PaymentFormValues>({
    defaultValues: {
      target: dues.openInvoices[0]?.invoiceId ?? 'advance',
      amount: '',
      method: 'cash',
      externalRef: '',
    },
  });

  if (record.isSuccess) {
    return (
      <>
        <h2 className="text-lg font-semibold">{t('payment.done.title')}</h2>
        <dl className="mt-4 space-y-3">
          <div>
            <dt className="text-[13px] text-muted">{t('payment.done.receipt')}</dt>
            <dd className="num">{record.data.receiptNumber}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">{t('payment.done.amount')}</dt>
            <dd className="num text-xl font-semibold">{taka(record.data.amount)}</dd>
          </div>
        </dl>
        <Link to={`/customers/${customer.id}`} className="mt-6 inline-block font-medium text-accent-text">
          {t('payment.done.back')}
        </Link>
      </>
    );
  }

  if (pending) {
    const invoice = dues.openInvoices.find((i) => i.invoiceId === pending.input.invoiceId);
    const values = {
      amount: taka(pending.input.amount),
      method: t(`payment.method.${pending.input.method}`),
      name: customer.name,
      invoice: invoice?.invoiceNumber ?? '',
    };
    const send = () => record.mutate(pending);
    const refusal = record.isError ? paymentRefusalOf(record.error) : null;
    return (
      <>
        <h2 className="text-lg font-semibold">{t('payment.confirm.title')}</h2>
        <p className="mt-3">
          {fill(t(invoice ? 'payment.confirm.invoice' : 'payment.confirm.advance'), values)}
        </p>
        {record.isError && (
          <p role="alert" className="mt-3 text-neg-text">
            {t(refusal ?? 'payment.error.save')}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {/* A refusal needs a change, not a retry: only "Change" is offered then. */}
          {!refusal && (
            <Button variant="primary" disabled={record.isPending} onClick={send}>
              {record.isPending
                ? t('payment.saving')
                : record.isError
                  ? t('customer.retry')
                  : t('payment.confirm.submit')}
            </Button>
          )}
          <Button
            disabled={record.isPending}
            onClick={() => {
              record.reset();
              setPending(null);
            }}
          >
            {t('payment.confirm.change')}
          </Button>
        </div>
      </>
    );
  }

  return <PaymentForm customer={customer} dues={dues} form={form} onReady={setPending} />;
}

function PaymentForm({
  customer,
  dues,
  form,
  onReady,
}: {
  customer: PartyDetail;
  dues: CustomerDues;
  form: ReturnType<typeof useForm<PaymentFormValues>>;
  onReady: (p: { input: RecordPaymentInput; key: string }) => void;
}) {
  const { t } = useI18n();
  const taka = useTaka();
  const ids = { target: useId(), amount: useId(), hint: useId(), ref: useId() };
  const { register, handleSubmit, setError, clearErrors, control, formState } = form;
  const method = useWatch({ control, name: 'method' });

  const onContinue = (values: PaymentFormValues) => {
    clearErrors();
    const result = toPaymentInput(customer.id, values);
    if (result.success) {
      onReady({ input: result.data, key: crypto.randomUUID() });
      return;
    }
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === 'amount') setError('amount', { message: t('payment.error.amount') });
      if (field === 'externalRef') setError('externalRef', { message: t('payment.error.externalRef') });
    }
  };

  return (
    <form noValidate onSubmit={(e) => void handleSubmit(onContinue)(e)} className="space-y-5">
      <div>
        <label htmlFor={ids.target} className="text-[13px] text-muted">
          {t('payment.for')}
        </label>
        <select id={ids.target} className={input} {...register('target')}>
          {dues.openInvoices.map((inv) => (
            <option key={inv.invoiceId} value={inv.invoiceId}>
              {fill(t('payment.for.invoice'), { invoice: inv.invoiceNumber, amount: taka(inv.due) })}
            </option>
          ))}
          <option value="advance">{t('payment.for.advance')}</option>
        </select>
      </div>

      <div>
        <label htmlFor={ids.amount} className="text-[13px] text-muted">
          {t('payment.amount')}
        </label>
        <input
          id={ids.amount}
          inputMode="decimal"
          autoComplete="off"
          aria-describedby={ids.hint}
          aria-invalid={Boolean(formState.errors.amount)}
          className={`${input} num`}
          {...register('amount')}
        />
        <p
          id={ids.hint}
          className={formState.errors.amount ? 'text-[13px] text-neg-text' : 'text-[13px] text-muted'}
        >
          {formState.errors.amount?.message ?? t('payment.amount.hint')}
        </p>
      </div>

      <fieldset>
        <legend className="text-[13px] text-muted">{t('payment.method')}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <label
              key={m}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-card-border bg-chip px-3 has-[:checked]:border-accent"
            >
              <input type="radio" value={m} {...register('method')} />
              {t(`payment.method.${m}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {method !== 'cash' && (
        <div>
          <label htmlFor={ids.ref} className="text-[13px] text-muted">
            {t('payment.externalRef')}
          </label>
          <input
            id={ids.ref}
            autoComplete="off"
            aria-invalid={Boolean(formState.errors.externalRef)}
            className={`${input} num`}
            {...register('externalRef')}
          />
          {formState.errors.externalRef && (
            <p className="text-[13px] text-neg-text">{formState.errors.externalRef.message}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary">
          {t('payment.continue')}
        </Button>
        <Link to={`/customers/${customer.id}`} className="font-medium text-accent-text">
          {t('payment.cancel')}
        </Link>
      </div>
    </form>
  );
}
